package main

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/harish/voidlab/infra/inventory"
	"github.com/pulumi/pulumi-command/sdk/go/command/remote"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultVMConfigDirectory = "../../vm/pulumi"
	defaultWireGuardName     = "wg-voidlab"
	defaultWireGuardCIDR     = "10.254.29.0/24"
	vmPulumiProject          = "voidlab-vm"
)

type hypervisor struct {
	spec         inventory.Host
	jump         jumpHost
	subnet       pulumi.StringOutput
	networkName  pulumi.StringOutput
	keySetup     *remote.Command
	publicKey    pulumi.StringOutput
	vmPrivateKey string
	nodes        []vmNode
}

type jumpHost struct {
	address    string
	user       string
	privateKey string
	hostKey    pulumi.StringPtrInput
}

type vmNode struct {
	name        string
	role        string
	address     pulumi.StringOutput
	hostKey     pulumi.StringPtrInput
	checkOutput pulumi.StringOutput
	jump        jumpHost
	sshUser     string
	privateKey  string
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-network")
		hosts, err := inventory.LoadHosts(configString(cfg, "vmConfigDirectory", defaultVMConfigDirectory))
		if err != nil {
			return err
		}
		hubIndex := findHub(hosts)
		if hubIndex < 0 {
			return fmt.Errorf("host1 must exist because it is the WireGuard hub")
		}

		hypervisors := make([]hypervisor, 0, len(hosts))
		for _, spec := range hosts {
			host, err := loadHypervisor(ctx, spec)
			if err != nil {
				return fmt.Errorf("load %s: %w", spec.Name, err)
			}
			hypervisors = append(hypervisors, host)
		}
		return configureNetwork(ctx, cfg, hypervisors, hubIndex)
	})
}

func loadHypervisor(ctx *pulumi.Context, spec inventory.Host) (hypervisor, error) {
	privateKey, err := readPrivateKey(spec.SSHPrivateKeyPath)
	if err != nil {
		return hypervisor{}, fmt.Errorf("read hypervisor SSH key: %w", err)
	}
	trustedHostKey, err := readKnownHostKey(spec.Address, spec.SSHAlias)
	if err != nil {
		return hypervisor{}, fmt.Errorf("resolve trusted SSH host key: %w", err)
	}
	jump := jumpHost{
		address:    spec.Address,
		user:       spec.SSHUser,
		privateKey: privateKey,
		hostKey:    pulumi.String(trustedHostKey),
	}
	stackName := fmt.Sprintf("%s/%s/%s", ctx.Organization(), vmPulumiProject, spec.StackName)
	stack, err := pulumi.NewStackReference(ctx, "vm-stack-"+spec.Name, &pulumi.StackReferenceArgs{Name: pulumi.String(stackName)})
	if err != nil {
		return hypervisor{}, fmt.Errorf("reference VM stack %s: %w", stackName, err)
	}
	vmPrivateKey, err := readPrivateKey(spec.VMSSHPrivateKeyPath)
	if err != nil {
		return hypervisor{}, fmt.Errorf("read VM SSH key: %w", err)
	}

	host := hypervisor{
		spec:         spec,
		jump:         jump,
		subnet:       requireVMOutput(spec.Name+" subnet", spec.NetworkCIDR, stack.GetStringOutput(pulumi.String("vmSubnet"))),
		networkName:  requireVMOutput(spec.Name+" libvirt network", spec.NetworkName, stack.GetStringOutput(pulumi.String("networkName"))),
		vmPrivateKey: vmPrivateKey,
	}
	for _, node := range spec.Nodes {
		address := requireVMOutput(node.Name+" address", node.IP,
			stack.GetStringOutput(pulumi.String("nodeIP_"+inventory.OutputKey(node.Name))))
		host.nodes = append(host.nodes, vmNode{
			name:       node.Name,
			role:       node.Role,
			address:    address,
			jump:       jump,
			sshUser:    spec.VMSSHUser,
			privateKey: vmPrivateKey,
		})
	}
	return host, nil
}

func requireVMOutput(label, expected string, output pulumi.StringOutput) pulumi.StringOutput {
	return output.ApplyT(func(actual string) (string, error) {
		if actual == "" {
			return "", fmt.Errorf("VM stack did not export %s", label)
		}
		if actual != expected {
			return "", fmt.Errorf("VM stack %s is %q, but the host inventory declares %q; update that VM stack first", label, actual, expected)
		}
		return actual, nil
	}).(pulumi.StringOutput)
}

func configureNetwork(ctx *pulumi.Context, cfg *config.Config, hosts []hypervisor, hubIndex int) error {
	wireGuardName := configString(cfg, "wireGuardInterface", defaultWireGuardName)
	tunnelCIDR := configString(cfg, "wireGuardCIDR", defaultWireGuardCIDR)
	tunnelPrefix, err := netip.ParsePrefix(tunnelCIDR)
	if err != nil || !tunnelPrefix.Addr().Is4() {
		return fmt.Errorf("wireGuardCIDR %q must be an IPv4 prefix", tunnelCIDR)
	}
	for _, host := range hosts {
		address, parseErr := netip.ParseAddr(host.spec.TunnelAddress)
		if parseErr != nil || !address.Is4() || !tunnelPrefix.Contains(address) {
			return fmt.Errorf("host %s tunnelAddress %q must be inside wireGuardCIDR %s", host.spec.Name, host.spec.TunnelAddress, tunnelCIDR)
		}
		subnet, _ := netip.ParsePrefix(host.spec.NetworkCIDR)
		if subnet.Contains(tunnelPrefix.Addr()) || tunnelPrefix.Contains(subnet.Addr()) {
			return fmt.Errorf("host %s VM subnet %s overlaps wireGuardCIDR %s", host.spec.Name, subnet, tunnelPrefix)
		}
	}
	prepareScript, err := readScript("prepare-wireguard-host.sh")
	if err != nil {
		return err
	}
	for i := range hosts {
		keySetup, err := runHostScript(ctx, "prepare-wireguard-"+hosts[i].spec.Name, hosts[i].jump, prepareScript, nil, nil)
		if err != nil {
			return fmt.Errorf("register WireGuard key setup for %s: %w", hosts[i].spec.Name, err)
		}
		hosts[i].keySetup = keySetup
		hosts[i].publicKey = keySetup.Stdout.ApplyT(func(value string) string { return strings.TrimSpace(value) }).(pulumi.StringOutput)
	}

	configureScript, err := readScript("configure-wireguard-host.sh")
	if err != nil {
		return err
	}
	hostRouting := make([]pulumi.Resource, len(hosts))
	for i := range hosts {
		peerConfig := wireGuardPeerConfig(hosts, i, hubIndex)
		remoteSubnets := remoteSubnetList(hosts, i)
		args := []pulumi.StringInput{
			hosts[i].subnet,
			pulumi.String(hosts[i].spec.TunnelAddress),
			hosts[i].networkName,
			pulumi.String(wireGuardName),
			peerConfig,
			remoteSubnets,
			pulumi.String(tunnelCIDR),
		}
		dependencies := make([]pulumi.Resource, 0, len(hosts))
		for j := range hosts {
			dependencies = append(dependencies, hosts[j].keySetup)
		}
		configured, err := runHostScript(ctx, "configure-wireguard-"+hosts[i].spec.Name, hosts[i].jump, configureScript, args, dependencies)
		if err != nil {
			return fmt.Errorf("register WireGuard routing for %s: %w", hosts[i].spec.Name, err)
		}

		hookScript, err := readScript("install-libvirt-forwarding-hook.sh")
		if err != nil {
			return err
		}
		hook, err := runHostScript(ctx, "install-libvirt-forwarding-hook-"+hosts[i].spec.Name, hosts[i].jump, hookScript,
			[]pulumi.StringInput{hosts[i].subnet, remoteSubnets, hosts[i].networkName, pulumi.String(wireGuardName)}, []pulumi.Resource{configured})
		if err != nil {
			return fmt.Errorf("register libvirt forwarding hook for %s: %w", hosts[i].spec.Name, err)
		}

		forwardingScript, err := readScript("apply-libvirt-forwarding-rules.sh")
		if err != nil {
			return err
		}
		forwarding, err := runHostScript(ctx, "apply-libvirt-forwarding-rules-"+hosts[i].spec.Name, hosts[i].jump, forwardingScript,
			[]pulumi.StringInput{hosts[i].subnet, remoteSubnets, hosts[i].networkName, pulumi.String(wireGuardName)}, []pulumi.Resource{hook})
		if err != nil {
			return fmt.Errorf("register libvirt forwarding rules for %s: %w", hosts[i].spec.Name, err)
		}
		hostRouting[i] = forwarding
	}

	if err := verifyAllNodes(ctx, hosts, hostRouting); err != nil {
		return err
	}

	allNodes := flattenNodes(hosts)
	addresses := pulumi.Map{}
	roles := pulumi.Map{}
	for _, node := range allNodes {
		addresses[node.name] = node.address
		roles[node.name] = pulumi.String(node.role)
		ctx.Export("nodeIP_"+inventory.OutputKey(node.name), node.address)
		if node.role == "control-plane" {
			ctx.Export("controlPlaneIP", node.address)
		}
	}
	for _, host := range hosts {
		ctx.Export("subnet_"+inventory.OutputKey(host.spec.Name), host.subnet)
	}
	ctx.Export("nodeIPs", addresses)
	ctx.Export("nodeRoles", roles)
	ctx.Export("verifiedNodeCount", pulumi.Int(len(allNodes)))
	ctx.Export("routingVerified", pulumi.All(routingOutputs(hosts)...).ApplyT(func([]interface{}) bool { return true }).(pulumi.BoolOutput))
	ctx.Export("wireGuardInterface", pulumi.String(wireGuardName))
	return nil
}

func wireGuardPeerConfig(hosts []hypervisor, localIndex, hubIndex int) pulumi.StringOutput {
	inputs := make([]any, 0)
	if localIndex == hubIndex {
		for i := range hosts {
			if i == localIndex {
				continue
			}
			inputs = append(inputs, hosts[i].publicKey, hosts[i].subnet)
		}
		if len(inputs) == 0 {
			return pulumi.String("").ToStringOutput()
		}
		return pulumi.All(inputs...).ApplyT(func(values []any) string {
			entries := make([]string, 0, len(hosts)-1)
			valueIndex := 0
			for i := range hosts {
				if i == localIndex {
					continue
				}
				publicKey := values[valueIndex].(string)
				subnet := values[valueIndex+1].(string)
				valueIndex += 2
				allowedIPs := hosts[i].spec.TunnelAddress + "/32," + subnet
				entries = append(entries, publicKey+"||"+allowedIPs)
			}
			return strings.Join(entries, ";")
		}).(pulumi.StringOutput)
	}

	hub := hosts[hubIndex]
	inputs = append(inputs, hub.publicKey)
	for i := range hosts {
		if i == localIndex {
			continue
		}
		inputs = append(inputs, hosts[i].subnet)
	}
	return pulumi.All(inputs...).ApplyT(func(values []any) string {
		publicKey := values[0].(string)
		allowedIPs := make([]string, 0, (len(hosts)-1)*2)
		valueIndex := 1
		for i := range hosts {
			if i == localIndex {
				continue
			}
			subnet := values[valueIndex].(string)
			valueIndex++
			allowedIPs = append(allowedIPs, hosts[i].spec.TunnelAddress+"/32", subnet)
		}
		return publicKey + "|" + hub.spec.Address + ":51820|" + strings.Join(allowedIPs, ",")
	}).(pulumi.StringOutput)
}
func remoteSubnetList(hosts []hypervisor, localIndex int) pulumi.StringOutput {
	remoteSubnets := make([]pulumi.StringOutput, 0, len(hosts)-1)
	for i := range hosts {
		if i != localIndex {
			remoteSubnets = append(remoteSubnets, hosts[i].subnet)
		}
	}
	return joinStringInputs(",", remoteSubnets)
}

func verifyAllNodes(ctx *pulumi.Context, hosts []hypervisor, dependencies []pulumi.Resource) error {
	verifyScript, err := readScript("verify-node-routing.sh")
	if err != nil {
		return err
	}
	for i := range hosts {
		scan, err := discoverVMHostKeys(ctx, hosts[i].jump, hosts[i].nodes)
		if err != nil {
			return fmt.Errorf("register VM host-key discovery for %s: %w", hosts[i].spec.Name, err)
		}
		for j := range hosts[i].nodes {
			node := &hosts[i].nodes[j]
			node.hostKey = pulumi.All(scan.Stdout, node.address).ApplyT(func(values []any) (string, error) {
				return scannedHostKey(values[0].(string), values[1].(string))
			}).(pulumi.StringOutput)
			check, err := verifyNodeRouting(ctx, *node, verifyScript, flattenNodeAddresses(hosts), dependencies)
			if err != nil {
				return fmt.Errorf("register routing check for %s: %w", node.name, err)
			}
			hosts[i].nodes[j].checkOutput = check.Stdout
		}
	}
	return nil
}

func discoverVMHostKeys(ctx *pulumi.Context, host jumpHost, nodes []vmNode) (*remote.Command, error) {
	scanScript := `#!/usr/bin/env bash
set -uo pipefail
command -v ssh-keyscan >/dev/null || { echo "ssh-keyscan is required on the hypervisor" >&2; exit 1; }
for ip in "$@"; do
  key_line=""
  for attempt in $(seq 1 30); do
    key_line="$(ssh-keyscan -T 3 -t ed25519 "$ip" 2>/dev/null | awk -v ip="$ip" '$2 == "ssh-ed25519" { print ip " " $2 " " $3; exit }')"
    if [[ -n "$key_line" ]]; then break; fi
    sleep 2
  done
  if [[ -z "$key_line" ]]; then
    echo "could not discover the ed25519 SSH host key for $ip" >&2
    exit 1
  fi
  printf '%s\n' "$key_line"
done
`
	addresses := make([]pulumi.StringInput, len(nodes))
	for i, node := range nodes {
		addresses[i] = node.address
	}
	command := pulumi.Sprintf("bash -s -- %s", shellQuoteInputs(addresses))
	return remote.NewCommand(ctx, "discover-vm-host-keys-"+strings.ReplaceAll(host.address, ".", "-"), &remote.CommandArgs{
		Connection:             hostConnection(host),
		Create:                 command,
		Stdin:                  pulumi.String(scanScript),
		AddPreviousOutputInEnv: pulumi.Bool(false),
		Logging:                remote.LoggingNone,
	})
}

func verifyNodeRouting(ctx *pulumi.Context, node vmNode, script string, peerIPs []pulumi.StringOutput, dependencies []pulumi.Resource) (*remote.Command, error) {
	peerList := joinStringInputs(",", peerIPs)
	args := []pulumi.StringInput{pulumi.String(node.name), node.address, peerList}
	command := pulumi.Sprintf("bash -s -- %s", shellQuoteInputs(args))
	privateKey := pulumi.ToSecret(pulumi.String(node.privateKey)).(pulumi.StringOutput)
	return remote.NewCommand(ctx, "verify-node-routing-"+node.name, &remote.CommandArgs{
		Connection: &remote.ConnectionArgs{
			Host:       node.address,
			User:       pulumi.String(node.sshUser),
			PrivateKey: privateKey,
			HostKey:    node.hostKey,
			Proxy: &remote.ProxyConnectionArgs{
				Host:       pulumi.String(node.jump.address),
				User:       pulumi.String(node.jump.user),
				PrivateKey: pulumi.ToSecret(pulumi.String(node.jump.privateKey)).(pulumi.StringOutput),
				HostKey:    node.jump.hostKey,
			},
		},
		Create:                 command,
		Stdin:                  pulumi.String(script),
		AddPreviousOutputInEnv: pulumi.Bool(false),
		Logging:                remote.LoggingNone,
	}, pulumi.DependsOn(dependencies))
}

func runHostScript(ctx *pulumi.Context, name string, host jumpHost, script string, args []pulumi.StringInput, dependencies []pulumi.Resource) (*remote.Command, error) {
	return runHostCommand(ctx, name, host, hostScriptCommand(args), pulumi.String(script), dependencies)
}

func runHostCommand(ctx *pulumi.Context, name string, host jumpHost, create pulumi.StringInput, script pulumi.StringInput, dependencies []pulumi.Resource) (*remote.Command, error) {
	var options []pulumi.ResourceOption
	if len(dependencies) != 0 {
		options = append(options, pulumi.DependsOn(dependencies))
	}
	return remote.NewCommand(ctx, name, &remote.CommandArgs{
		Connection:             hostConnection(host),
		Create:                 create,
		Stdin:                  script,
		AddPreviousOutputInEnv: pulumi.Bool(false),
		Logging:                remote.LoggingNone,
	}, options...)
}

func hostScriptCommand(args []pulumi.StringInput) pulumi.StringOutput {
	if len(args) == 0 {
		return pulumi.String("sudo -n bash -s").ToStringOutput()
	}
	return pulumi.Sprintf("sudo -n bash -s -- %s", shellQuoteInputs(args))
}

func shellQuoteInputs(args []pulumi.StringInput) pulumi.StringOutput {
	inputs := make([]any, len(args))
	for i, arg := range args {
		inputs[i] = arg
	}
	return pulumi.All(inputs...).ApplyT(func(values []any) (string, error) {
		quoted := make([]string, len(values))
		for i, value := range values {
			argument, ok := value.(string)
			if !ok {
				return "", fmt.Errorf("command argument %d has type %T, expected string", i, value)
			}
			quoted[i] = shellQuote(argument)
		}
		return strings.Join(quoted, " "), nil
	}).(pulumi.StringOutput)
}

func joinStringInputs(separator string, inputs []pulumi.StringOutput) pulumi.StringOutput {
	if len(inputs) == 0 {
		return pulumi.String("").ToStringOutput()
	}
	values := make([]any, len(inputs))
	for i, input := range inputs {
		values[i] = input
	}
	return pulumi.All(values...).ApplyT(func(resolved []any) (string, error) {
		joined := make([]string, len(resolved))
		for i, value := range resolved {
			text, ok := value.(string)
			if !ok {
				return "", fmt.Errorf("string input %d has type %T, expected string", i, value)
			}
			joined[i] = text
		}
		return strings.Join(joined, separator), nil
	}).(pulumi.StringOutput)
}

func hostConnection(host jumpHost) *remote.ConnectionArgs {
	return &remote.ConnectionArgs{
		Host:       pulumi.String(host.address),
		User:       pulumi.String(host.user),
		PrivateKey: pulumi.ToSecret(pulumi.String(host.privateKey)).(pulumi.StringOutput),
		HostKey:    host.hostKey,
	}
}

func flattenNodes(hosts []hypervisor) []vmNode {
	var nodes []vmNode
	for _, host := range hosts {
		nodes = append(nodes, host.nodes...)
	}
	return nodes
}

func flattenNodeAddresses(hosts []hypervisor) []pulumi.StringOutput {
	nodes := flattenNodes(hosts)
	addresses := make([]pulumi.StringOutput, len(nodes))
	for i, node := range nodes {
		addresses[i] = node.address
	}
	return addresses
}

func routingOutputs(hosts []hypervisor) []any {
	var outputs []any
	for _, host := range hosts {
		for _, node := range host.nodes {
			outputs = append(outputs, node.checkOutput)
		}
	}
	return outputs
}

func findHub(hosts []inventory.Host) int {
	for i, host := range hosts {
		if host.Name == "host1" {
			return i
		}
	}
	return -1
}

func readScript(name string) (string, error) {
	contents, err := os.ReadFile(filepath.Join("scripts", name))
	if err != nil {
		return "", fmt.Errorf("read %s: %w", filepath.Join("scripts", name), err)
	}
	return string(contents), nil
}

func readPrivateKey(path string) (string, error) {
	keyBytes, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read SSH private key %q: %w", path, err)
	}
	privateKey := strings.TrimSpace(string(keyBytes))
	if privateKey == "" {
		return "", fmt.Errorf("SSH private key %q is empty", path)
	}
	return privateKey, nil
}

func readKnownHostKey(address, alias string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("locate home directory: %w", err)
	}
	knownHostsPath := filepath.Join(home, ".ssh", "known_hosts")
	for _, candidate := range []string{address, alias} {
		if candidate == "" {
			continue
		}
		output, commandErr := exec.Command("ssh-keygen", "-F", candidate, "-f", knownHostsPath).Output()
		if commandErr != nil {
			continue
		}
		for _, line := range strings.Split(string(output), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 3 || strings.HasPrefix(fields[0], "#") {
				continue
			}
			key := fields[1] + " " + fields[2]
			if isSSHKey(key) {
				return key, nil
			}
		}
	}
	return "", fmt.Errorf("no OpenSSH host key for %q in %s; connect to the host once so its key is saved", address, knownHostsPath)
}

func scannedHostKey(output, address string) (string, error) {
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 || fields[0] != address {
			continue
		}
		key := fields[1] + " " + fields[2]
		if isSSHKey(key) {
			return key, nil
		}
	}
	return "", fmt.Errorf("host-key discovery output did not contain a valid ed25519 key for %s", address)
}

func isSSHKey(value string) bool {
	fields := strings.Fields(value)
	if len(fields) < 2 {
		return false
	}
	keyType := fields[0]
	if !strings.HasPrefix(keyType, "ssh-") && !strings.HasPrefix(keyType, "ecdsa-") && !strings.HasPrefix(keyType, "sk-") {
		return false
	}
	blob, err := base64.StdEncoding.DecodeString(fields[1])
	if err != nil || len(blob) < 4 {
		return false
	}
	typeLength := binary.BigEndian.Uint32(blob[:4])
	if typeLength == 0 || uint64(typeLength) > uint64(len(blob)-4) {
		return false
	}
	return string(blob[4:4+int(typeLength)]) == keyType
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func configString(cfg *config.Config, key, fallback string) string {
	if value := cfg.Get(key); value != "" {
		return value
	}
	return fallback
}
