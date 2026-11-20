// Package inventory reads the Pulumi.host*.yaml files used by the VM stacks.
// Network and Kubernetes use the same files to discover hosts and node roles.
package inventory

import (
	"encoding/json"
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

type Node struct {
	Name        string `json:"name"`
	Role        string `json:"role"`
	IP          string `json:"ip"`
	MAC         string `json:"mac"`
	VCPUs       int    `json:"vcpus"`
	MemoryMiB   int    `json:"memoryMiB"`
	DiskGiB     int    `json:"diskGiB"`
	DataDiskGiB int    `json:"dataDiskGiB"`
}

type Host struct {
	Name                string `json:"name"`
	StackName           string `json:"-"`
	Address             string `json:"address"`
	SSHUser             string `json:"sshUser"`
	SSHPrivateKeyPath   string `json:"sshPrivateKeyPath"`
	SSHAlias            string `json:"sshAlias"`
	TunnelAddress       string `json:"tunnelAddress"`
	NetworkName         string `json:"networkName"`
	NetworkCIDR         string `json:"networkCIDR"`
	Gateway             string `json:"gateway"`
	DHCPRangeStart      string `json:"dhcpRangeStart"`
	DHCPRangeEnd        string `json:"dhcpRangeEnd"`
	PoolName            string `json:"poolName"`
	PoolPath            string `json:"poolPath"`
	DataPoolName        string `json:"dataPoolName"`
	DataPoolPath        string `json:"dataPoolPath"`
	UbuntuImageURL      string `json:"ubuntuImageURL"`
	SSHPublicKeyPath    string `json:"sshPublicKeyPath"`
	VMSSHUser           string `json:"vmSSHUser"`
	VMSSHPrivateKeyPath string `json:"vmSSHPrivateKeyPath"`
	Timezone            string `json:"timezone"`
	Nodes               []Node `json:"nodes"`
}

type stackConfigFile struct {
	Config map[string]any `yaml:"config"`
}

// LoadHosts finds every Pulumi.host*.yaml file in configDir and reads the
// voidlab-vm:host object from each one. The file name is also the VM stack name.
func LoadHosts(configDir string) ([]Host, error) {
	paths, err := filepath.Glob(filepath.Join(configDir, "Pulumi.host*.yaml"))
	if err != nil {
		return nil, fmt.Errorf("find host stack configs in %s: %w", configDir, err)
	}
	sort.Strings(paths)
	if len(paths) == 0 {
		return nil, fmt.Errorf("no Pulumi.host*.yaml files found in %s", configDir)
	}

	hosts := make([]Host, 0, len(paths))
	seenHosts := map[string]bool{}
	seenHostAddresses := map[string]string{}
	seenNodes := map[string]string{}
	seenNodeIPs := map[netip.Addr]string{}
	seenSubnets := map[string]string{}
	subnets := make([]netip.Prefix, 0, len(paths))
	seenTunnelAddresses := map[string]string{}
	controlPlanes := 0
	for _, path := range paths {
		host, err := readHost(path)
		if err != nil {
			return nil, err
		}
		if seenHosts[host.Name] {
			return nil, fmt.Errorf("host name %q is declared more than once", host.Name)
		}
		seenHosts[host.Name] = true
		if other, exists := seenHostAddresses[host.Address]; exists {
			return nil, fmt.Errorf("hosts %s and %s use the same hypervisor address %s", other, host.Name, host.Address)
		}
		seenHostAddresses[host.Address] = host.Name
		if other, exists := seenSubnets[host.NetworkCIDR]; exists {
			return nil, fmt.Errorf("hosts %s and %s use the same VM subnet %s", other, host.Name, host.NetworkCIDR)
		}
		prefix, _ := netip.ParsePrefix(host.NetworkCIDR)
		for i, existing := range subnets {
			if existing.Contains(prefix.Addr()) || prefix.Contains(existing.Addr()) {
				return nil, fmt.Errorf("host %s VM subnet %s overlaps %s VM subnet %s", host.Name, prefix, hosts[i].Name, existing)
			}
		}
		subnets = append(subnets, prefix)
		seenSubnets[host.NetworkCIDR] = host.Name
		if other, exists := seenTunnelAddresses[host.TunnelAddress]; exists {
			return nil, fmt.Errorf("hosts %s and %s use the same WireGuard address %s", other, host.Name, host.TunnelAddress)
		}
		seenTunnelAddresses[host.TunnelAddress] = host.Name
		for _, node := range host.Nodes {
			if other, exists := seenNodes[node.Name]; exists {
				return nil, fmt.Errorf("node name %q is assigned to both %s and %s", node.Name, other, host.Name)
			}
			seenNodes[node.Name] = host.Name
			ip, _ := netip.ParseAddr(node.IP)
			if other, exists := seenNodeIPs[ip]; exists {
				return nil, fmt.Errorf("node IP %s is assigned on both %s and %s", ip, other, host.Name)
			}
			seenNodeIPs[ip] = host.Name
			if node.Role == "control-plane" {
				controlPlanes++
			}
		}
		hosts = append(hosts, host)
	}
	if controlPlanes != 1 {
		return nil, fmt.Errorf("the current kubeadm bootstrap needs exactly one control-plane node; found %d", controlPlanes)
	}
	return hosts, nil
}

func readHost(path string) (Host, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Host{}, fmt.Errorf("read host config %s: %w", path, err)
	}
	var file stackConfigFile
	if err := yaml.Unmarshal(data, &file); err != nil {
		return Host{}, fmt.Errorf("parse host config %s: %w", path, err)
	}
	raw, exists := file.Config["voidlab-vm:host"]
	if !exists {
		return Host{}, fmt.Errorf("%s is missing the voidlab-vm:host config object", path)
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return Host{}, fmt.Errorf("read host settings from %s: %w", path, err)
	}
	var host Host
	if err := json.Unmarshal(encoded, &host); err != nil {
		return Host{}, fmt.Errorf("decode host settings from %s: %w", path, err)
	}
	baseName := strings.TrimSuffix(filepath.Base(path), ".yaml")
	stackName := strings.TrimPrefix(baseName, "Pulumi.")
	host.StackName = stackName
	if host.Name == "" {
		host.Name = stackName
	}
	if host.Name != stackName {
		return Host{}, fmt.Errorf("host name %q in %s must match its stack name %q", host.Name, path, stackName)
	}
	if err := validateHost(host, path); err != nil {
		return Host{}, err
	}
	return host, nil
}

func validateHost(host Host, path string) error {
	if host.Address == "" || host.SSHUser == "" || host.SSHPrivateKeyPath == "" {
		return fmt.Errorf("%s must configure host address, sshUser, and sshPrivateKeyPath", path)
	}
	if host.TunnelAddress == "" {
		return fmt.Errorf("%s must configure tunnelAddress", path)
	}
	if address, err := netip.ParseAddr(host.Address); err != nil || !address.Is4() {
		return fmt.Errorf("%s host address %q must be an IPv4 address", path, host.Address)
	}
	if address, err := netip.ParseAddr(host.TunnelAddress); err != nil || !address.Is4() {
		return fmt.Errorf("%s tunnelAddress %q must be an IPv4 address", path, host.TunnelAddress)
	}
	prefix, err := netip.ParsePrefix(host.NetworkCIDR)
	if err != nil || !prefix.Addr().Is4() {
		return fmt.Errorf("%s networkCIDR %q must be an IPv4 prefix", path, host.NetworkCIDR)
	}
	if host.NetworkName == "" || host.PoolName == "" || host.PoolPath == "" || host.SSHPublicKeyPath == "" || host.VMSSHUser == "" || host.VMSSHPrivateKeyPath == "" {
		return fmt.Errorf("%s must configure networkName, poolName, poolPath, sshPublicKeyPath, vmSSHUser, and vmSSHPrivateKeyPath", path)
	}
	if len(host.Nodes) == 0 {
		return fmt.Errorf("%s must configure at least one node", path)
	}
	nodeNamePattern := regexp.MustCompile(`^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$`)
	for _, node := range host.Nodes {
		if !nodeNamePattern.MatchString(node.Name) || node.IP == "" {
			return fmt.Errorf("%s has a node with an invalid name or missing IP address", path)
		}
		if node.Role != "control-plane" && node.Role != "worker" {
			return fmt.Errorf("%s node %q role must be control-plane or worker", path, node.Name)
		}
		address, err := netip.ParseAddr(node.IP)
		if err != nil || !address.Is4() || !prefix.Contains(address) {
			return fmt.Errorf("%s node %q IP %q must be inside %s", path, node.Name, node.IP, host.NetworkCIDR)
		}
		if node.VCPUs < 0 || node.MemoryMiB < 0 || node.DiskGiB < 0 || node.DataDiskGiB < 0 {
			return fmt.Errorf("%s node %q resource sizes cannot be negative", path, node.Name)
		}
	}
	return nil
}

// OutputKey turns a node name into a simple Pulumi output suffix.
func OutputKey(nodeName string) string {
	return strings.ReplaceAll(nodeName, "-", "_")
}
