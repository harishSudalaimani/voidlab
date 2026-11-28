package main

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/pulumi/pulumi-command/sdk/go/command/remote"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultPodCIDR  = "10.244.0.0/16"
	kubernetesMinor = "1.37"
	// The default /24 node CIDR has enough IPv4 addresses for 200 pods with headroom.
	kubeletMaxPods  = "200"
)

type serverConfig struct {
	Name              string `json:"name"`
	Role              string `json:"role"`
	Address           string `json:"address"`
	SSHAddress        string `json:"sshAddress"`
	SSHUser           string `json:"sshUser"`
	SSHPrivateKeyPath string `json:"sshPrivateKeyPath"`
}

type node struct {
	name           string
	role           string
	address        pulumi.StringOutput
	sshAddress     pulumi.StringOutput
	hostKey        pulumi.StringPtrInput
	sshUser        string
	privateKey     string
	privateKeyPath string
}

type clusterConfig struct {
	controlPlane node
	podCIDR      string
	allowOneCPU  bool
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-kubernetes")
		var servers []serverConfig
		if err := cfg.GetObject("servers", &servers); err != nil {
			return fmt.Errorf("read Kubernetes server configuration: %w", err)
		}
		if err := validateServers(servers); err != nil {
			return err
		}

		cluster := clusterConfig{
			podCIDR:     configString(cfg, "podCIDR", defaultPodCIDR),
			allowOneCPU: cfg.GetBool("allowSingleCPUControlPlane"),
		}
		for _, server := range servers {
			sshAddress := server.SSHAddress
			if sshAddress == "" {
				sshAddress = server.Address
			}
			privateKey, err := readPrivateKey(server.SSHPrivateKeyPath)
			if err != nil {
				return fmt.Errorf("read %s SSH key: %w", server.Name, err)
			}
			hostKey, err := readKnownHostKey(sshAddress)
			if err != nil {
				return fmt.Errorf("resolve %s SSH host key: %w", server.Name, err)
			}
			current := node{
				name: server.Name, role: server.Role, address: pulumi.String(server.Address).ToStringOutput(),
				sshAddress: pulumi.String(sshAddress).ToStringOutput(),
				hostKey:    pulumi.String(hostKey), sshUser: server.SSHUser, privateKey: privateKey,
				privateKeyPath: expandHome(server.SSHPrivateKeyPath),
			}
			if current.role == "control-plane" {
				cluster.controlPlane = current
			}
		}
		allNodes := cluster.nodes()

		preflightScript, err := readScript("preflight.sh")
		if err != nil {
			return err
		}
		setupScript, err := readScript("install-node.sh")
		if err != nil {
			return err
		}
		preflights := make([]pulumi.Resource, 0, len(allNodes))
		for _, current := range allNodes {
			allowOneCPU := "false"
			if current.role == "control-plane" && cluster.allowOneCPU {
				allowOneCPU = "true"
			}
			check, err := runScript(ctx, "preflight-"+current.name, current, preflightScript,
				[]pulumi.StringInput{pulumi.String(current.name), pulumi.String(current.role), pulumi.String(allowOneCPU)}, nil, false)
			if err != nil {
				return fmt.Errorf("register %s preflight: %w", current.name, err)
			}
			preflights = append(preflights, check)
		}

		setupResources := make([]pulumi.Resource, 0, len(allNodes))
		for _, current := range allNodes {
			containerdRoot := "/var/lib/containerd"
			if current.role == "control-plane" {
				containerdRoot = "/data/vms/containerd"
			}
			setup, err := runScript(ctx, "install-"+current.name, current, setupScript,
				[]pulumi.StringInput{pulumi.String(kubernetesMinor), pulumi.String(containerdRoot)}, preflights, false)
			if err != nil {
				return fmt.Errorf("register %s Kubernetes setup: %w", current.name, err)
			}
			setupResources = append(setupResources, setup)
		}

		initScript, err := readScript("init-control-plane.sh")
		if err != nil {
			return err
		}
		initArgs := []pulumi.StringInput{cluster.controlPlane.address, pulumi.String(cluster.podCIDR), pulumi.String("false")}
		if cluster.allowOneCPU {
			initArgs[2] = pulumi.String("true")
		}
		controlPlaneInit, err := runScript(ctx, "init-control-plane", cluster.controlPlane, initScript,
			initArgs, setupResources, false)
		if err != nil {
			return fmt.Errorf("register kubeadm init: %w", err)
		}

		podCapacityScript, err := readScript("configure-kubelet-pod-capacity.sh")
		if err != nil {
			return err
		}
		podCapacity, err := remote.NewCommand(ctx, "configure-control-plane-pod-capacity", &remote.CommandArgs{
			Connection: connection(cluster.controlPlane),
			Create:     pulumi.String("sudo -n bash -s -- " + kubeletMaxPods),
			Stdin:      pulumi.String(podCapacityScript),
			Triggers: pulumi.Array{
				pulumi.String("kubelet-max-pods-" + kubeletMaxPods + "-v1"),
				pulumi.String(podCapacityScript),
			},
			Logging: remote.LoggingNone,
		}, pulumi.DependsOn([]pulumi.Resource{controlPlaneInit}))
		if err != nil {
			return fmt.Errorf("register control-plane pod-capacity configuration: %w", err)
		}

		singleNodeScheduling, err := remote.NewCommand(ctx, "enable-control-plane-scheduling", &remote.CommandArgs{
			Connection: connection(cluster.controlPlane),
			Create:     pulumi.String("sudo -n kubectl --kubeconfig=/etc/kubernetes/admin.conf taint node cp node-role.kubernetes.io/control-plane:NoSchedule- || true"),
			Triggers:   pulumi.Array{pulumi.String("single-node-schedulable-v1")},
			Logging:    remote.LoggingNone,
		}, pulumi.DependsOn([]pulumi.Resource{podCapacity}))
		if err != nil {
			return fmt.Errorf("register single-node scheduling configuration: %w", err)
		}

		readyScript, err := readScript("wait-for-nodes.sh")
		if err != nil {
			return err
		}
		registration, err := runScript(ctx, "confirm-nodes-registered", cluster.controlPlane, readyScript,
			[]pulumi.StringInput{pulumi.String(strconv.Itoa(len(allNodes)))}, []pulumi.Resource{singleNodeScheduling}, false)
		if err != nil {
			return fmt.Errorf("register node-registration check: %w", err)
		}

		kubeconfigScript, err := readScript("export-kubeconfig.sh")
		if err != nil {
			return err
		}
		kubeconfig, err := runScript(ctx, "export-kubeconfig", cluster.controlPlane, kubeconfigScript,
			[]pulumi.StringInput{cluster.controlPlane.address}, []pulumi.Resource{registration}, true)
		if err != nil {
			return fmt.Errorf("register kubeconfig export: %w", err)
		}

		names, addresses, roles := pulumi.Map{}, pulumi.Map{}, pulumi.Map{}
		for _, current := range allNodes {
			names[current.name] = pulumi.String(current.name)
			addresses[current.name] = current.address
			roles[current.name] = pulumi.String(current.role)
			ctx.Export("nodeIP_"+strings.ReplaceAll(current.name, "-", "_"), current.address)
			ctx.Export("nodeRole_"+strings.ReplaceAll(current.name, "-", "_"), pulumi.String(current.role))
		}
		ctx.Export("nodeNames", names)
		ctx.Export("nodeIPs", addresses)
		ctx.Export("nodeRoles", roles)
		ctx.Export("controlPlaneIP", cluster.controlPlane.address)
		ctx.Export("kubernetesVersion", pulumi.String(kubernetesMinor))
		ctx.Export("podCIDR", pulumi.String(cluster.podCIDR))
		controlPlane := cluster.controlPlane
		ctx.Export("sshTunnel", pulumi.Sprintf("ssh -i %s -N -L 16443:%s:6443 %s@%s",
			shellQuote(controlPlane.privateKeyPath), controlPlane.address, shellQuote(controlPlane.sshUser), controlPlane.sshAddress))
		ctx.Export("kubeconfigBase64", kubeconfig.Stdout)
		return nil
	})
}

func (c clusterConfig) nodes() []node {
	return []node{c.controlPlane}
}

func validateServers(servers []serverConfig) error {
	if len(servers) == 0 {
		return fmt.Errorf("no servers are configured; add the control-plane server to voidlab-kubernetes:servers")
	}
	if len(servers) != 1 {
		return fmt.Errorf("single-node cluster config requires exactly one control-plane server")
	}
	seenNames, seenAddresses := map[string]bool{}, map[string]bool{}
	controlPlanes := 0
	for _, server := range servers {
		if server.Name != "cp" {
			return fmt.Errorf("single-node cluster server must be named cp; got %q", server.Name)
		}
		if server.Name == "" || server.SSHUser == "" || server.SSHPrivateKeyPath == "" {
			return fmt.Errorf("each server must set name, sshUser, and sshPrivateKeyPath")
		}
		if seenNames[server.Name] {
			return fmt.Errorf("server name %q is configured more than once", server.Name)
		}
		seenNames[server.Name] = true
		address, err := netip.ParseAddr(server.Address)
		if err != nil || !address.Is4() {
			return fmt.Errorf("server %s address %q must be an IPv4 address", server.Name, server.Address)
		}
		if seenAddresses[server.Address] {
			return fmt.Errorf("server address %q is configured more than once", server.Address)
		}
		seenAddresses[server.Address] = true
		sshAddress := server.SSHAddress
		if sshAddress == "" {
			sshAddress = server.Address
		}
		if address, err := netip.ParseAddr(sshAddress); err != nil || !address.Is4() {
			return fmt.Errorf("server %s sshAddress %q must be an IPv4 address", server.Name, sshAddress)
		}
		switch server.Role {
		case "control-plane":
			controlPlanes++
		default:
			return fmt.Errorf("server %s role must be control-plane for this single-node cluster", server.Name)
		}
	}
	if controlPlanes != 1 {
		return fmt.Errorf("configure exactly one control-plane; found %d", controlPlanes)
	}
	return nil
}

func runScript(ctx *pulumi.Context, name string, target node, script string, args []pulumi.StringInput, dependencies []pulumi.Resource, secretStdout bool) (*remote.Command, error) {
	var command pulumi.StringInput = pulumi.String("sudo -n bash -s")
	if len(args) != 0 {
		command = pulumi.Sprintf("sudo -n bash -s -- %s", shellQuoteInputs(args))
	}
	options := []pulumi.ResourceOption{pulumi.AdditionalSecretOutputs([]string{"stdout"})}
	if !secretStdout {
		options = nil
	}
	if len(dependencies) != 0 {
		options = append(options, pulumi.DependsOn(dependencies))
	}
	return remote.NewCommand(ctx, name, &remote.CommandArgs{
		Connection: connection(target), Create: command, Stdin: pulumi.String(script), Logging: remote.LoggingNone,
	}, options...)
}

func connection(target node) *remote.ConnectionArgs {
	return &remote.ConnectionArgs{
		Host: target.sshAddress, User: pulumi.String(target.sshUser),
		PrivateKey: pulumi.ToSecret(pulumi.String(target.privateKey)).(pulumi.StringOutput), HostKey: target.hostKey,
	}
}

func readScript(name string) (string, error) {
	contents, err := os.ReadFile(filepath.Join("scripts", name))
	if err != nil {
		return "", fmt.Errorf("read %s: %w", filepath.Join("scripts", name), err)
	}
	return string(contents), nil
}

func configString(cfg *config.Config, key, fallback string) string {
	if value := cfg.Get(key); value != "" {
		return value
	}
	return fallback
}

func readPrivateKey(path string) (string, error) {
	path = expandHome(path)
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

func readKnownHostKey(address string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("locate home directory: %w", err)
	}
	knownHostsPath := filepath.Join(home, ".ssh", "known_hosts")
	output, err := exec.Command("ssh-keygen", "-F", address, "-f", knownHostsPath).Output()
	if err != nil {
		return "", fmt.Errorf("no trusted SSH host key for %s in %s; connect to the server once first", address, knownHostsPath)
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
	return "", fmt.Errorf("no usable SSH host key for %s in %s", address, knownHostsPath)
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

func shellQuoteInputs(args []pulumi.StringInput) pulumi.StringOutput {
	inputs := make([]any, len(args))
	for i, arg := range args {
		inputs[i] = arg
	}
	return pulumi.All(inputs...).ApplyT(func(values []interface{}) (string, error) {
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

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func expandHome(path string) string {
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, strings.TrimPrefix(path, "~/"))
	}
	return path
}
