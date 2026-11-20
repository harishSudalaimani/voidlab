package main

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/harish/voidlab/infra/inventory"
	"github.com/pulumi/pulumi-command/sdk/go/command/remote"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultVMConfigDirectory = "../../vm/pulumi"
	defaultPodCIDR           = "10.244.0.0/16"
)

type node struct {
	name         string
	role         string
	address      pulumi.StringOutput
	hostKey      pulumi.StringPtrInput
	jump         jumpHost
	sshUser      string
	vmPrivateKey string
}

type jumpHost struct {
	address    string
	user       string
	privateKey string
	hostKey    pulumi.StringPtrInput
}

type clusterConfig struct {
	controlPlane        node
	workers             []node
	tunnelTarget        string
	tunnelKeyPath       string
	podCIDR             string
	allowOneCPU         bool
	joinTokenGeneration string
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-kubernetes")
		hosts, err := inventory.LoadHosts(configString(cfg, "vmConfigDirectory", defaultVMConfigDirectory))
		if err != nil {
			return err
		}
		// The network stack owns the node IP list and only publishes routingVerified after peer checks pass.
		networkStack, err := pulumi.NewStackReference(ctx, "network-stack", &pulumi.StackReferenceArgs{
			Name: pulumi.String(configString(cfg, "networkStack", "snharish85-gmail-com-org/voidlab-network/network")),
		})
		if err != nil {
			return fmt.Errorf("reference network stack: %w", err)
		}
		routingVerified := networkStack.GetOutput(pulumi.String("routingVerified")).ApplyT(func(value interface{}) (bool, error) {
			verified, ok := value.(bool)
			if !ok {
				return false, fmt.Errorf("network stack routingVerified output has type %T, expected bool", value)
			}
			return verified, nil
		}).(pulumi.BoolOutput)
		cluster := clusterConfig{
			podCIDR:             configString(cfg, "podCIDR", defaultPodCIDR),
			allowOneCPU:         cfg.GetBool("allowSingleCPUControlPlane"),
			joinTokenGeneration: configString(cfg, "joinTokenGeneration", "1"),
		}
		foundHub := false
		for _, host := range hosts {
			hostKeyPath, err := readPrivateKey(host.SSHPrivateKeyPath)
			if err != nil {
				return fmt.Errorf("read %s hypervisor SSH key: %w", host.Name, err)
			}
			hostKey, err := readKnownHostKey(host.Address, host.SSHAlias)
			if err != nil {
				return fmt.Errorf("resolve %s SSH host key: %w", host.Name, err)
			}
			vmPrivateKey, err := readPrivateKey(host.VMSSHPrivateKeyPath)
			if err != nil {
				return fmt.Errorf("read %s VM SSH key: %w", host.Name, err)
			}
			jump := jumpHost{address: host.Address, user: host.SSHUser, privateKey: hostKeyPath, hostKey: pulumi.String(hostKey)}
			if host.Name == "host1" {
				foundHub = true
				cluster.tunnelTarget = host.SSHAlias
				if cluster.tunnelTarget == "" {
					cluster.tunnelTarget = host.SSHUser + "@" + host.Address
				}
				cluster.tunnelKeyPath = host.SSHPrivateKeyPath
			}
			addresses := make([]pulumi.StringOutput, len(host.Nodes))
			for i, declaredNode := range host.Nodes {
				addresses[i] = requireVerifiedNetworkAddress(declaredNode.Name, routingVerified,
					networkStack.GetStringOutput(pulumi.String("nodeIP_"+inventory.OutputKey(declaredNode.Name))))
			}
			scan, err := discoverVMHostKeys(ctx, host.Name, jump, addresses)
			if err != nil {
				return fmt.Errorf("register %s VM host-key discovery: %w", host.Name, err)
			}
			for i, declaredNode := range host.Nodes {
				current := node{
					name: declaredNode.Name, role: declaredNode.Role, address: addresses[i],
					hostKey: hostKeyOutput(scan.Stdout, addresses[i]), jump: jump,
					sshUser: host.VMSSHUser, vmPrivateKey: vmPrivateKey,
				}
				if current.role == "control-plane" {
					cluster.controlPlane = current
				} else {
					cluster.workers = append(cluster.workers, current)
				}
			}
		}
		if !foundHub {
			return fmt.Errorf("host1 must exist because it is the WireGuard hub and SSH tunnel entry point")
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
		for _, current := range cluster.nodes() {
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
		for _, current := range cluster.nodes() {
			setup, err := runScript(ctx, "install-"+current.name, current, setupScript,
				[]pulumi.StringInput{pulumi.String("v1.37")}, preflights, false)
			if err != nil {
				return fmt.Errorf("register %s Kubernetes setup: %w", current.name, err)
			}
			setupResources = append(setupResources, setup)
		}

		initScript, err := readScript("init-control-plane.sh")
		if err != nil {
			return err
		}
		initArgs := []pulumi.StringInput{cluster.controlPlane.address, pulumi.String(cluster.podCIDR), pulumi.String("false"), pulumi.String(cluster.joinTokenGeneration)}
		if cluster.allowOneCPU {
			initArgs[2] = pulumi.String("true")
		}
		controlPlaneInit, err := runScript(ctx, "init-control-plane", cluster.controlPlane, initScript,
			initArgs, setupResources, true)
		if err != nil {
			return fmt.Errorf("register kubeadm init: %w", err)
		}

		joinResources := make([]pulumi.Resource, 0, len(cluster.workers))
		for _, worker := range cluster.workers {
			join, err := registerWorkerJoin(ctx, worker, controlPlaneInit.Stdout, []pulumi.Resource{controlPlaneInit})
			if err != nil {
				return fmt.Errorf("register %s join: %w", worker.name, err)
			}
			joinResources = append(joinResources, join)
		}

		readyScript, err := readScript("wait-for-nodes.sh")
		if err != nil {
			return err
		}
		registration, err := runScript(ctx, "confirm-nodes-registered", cluster.controlPlane, readyScript,
			[]pulumi.StringInput{pulumi.String(strconv.Itoa(len(allNodes)))}, joinResources, false)
		if err != nil {
			return fmt.Errorf("register node-registration check: %w", err)
		}

		kubeconfigScript, err := readScript("export-kubeconfig.sh")
		if err != nil {
			return err
		}
		kubeconfig, err := runScript(ctx, "export-kubeconfig", cluster.controlPlane, kubeconfigScript,
			[]pulumi.StringInput{cluster.controlPlane.address, pulumi.String(cluster.joinTokenGeneration)}, []pulumi.Resource{registration}, true)
		if err != nil {
			return fmt.Errorf("register kubeconfig export: %w", err)
		}

		names, addresses := pulumi.Map{}, pulumi.Map{}
		roles := pulumi.Map{}
		for _, current := range allNodes {
			names[current.name] = pulumi.String(current.name)
			addresses[current.name] = current.address
			roles[current.name] = pulumi.String(current.role)
		}
		ctx.Export("nodeNames", names)
		ctx.Export("nodeIPs", addresses)
		ctx.Export("nodeRoles", roles)
		ctx.Export("controlPlaneIP", cluster.controlPlane.address)
		ctx.Export("kubernetesVersion", pulumi.String("1.37"))
		ctx.Export("podCIDR", pulumi.String(cluster.podCIDR))
		ctx.Export("sshTunnel", pulumi.Sprintf("ssh -i %s -N -L 16443:%s:6443 %s",
			shellQuote(cluster.tunnelKeyPath), cluster.controlPlane.address, shellQuote(cluster.tunnelTarget)))
		ctx.Export("kubeconfigBase64", kubeconfig.Stdout)
		return nil
	})
}

func (c clusterConfig) nodes() []node {
	return append([]node{c.controlPlane}, c.workers...)
}

func discoverVMHostKeys(ctx *pulumi.Context, hostName string, host jumpHost, addresses []pulumi.StringOutput) (*remote.Command, error) {
	scanScript := `#!/usr/bin/env bash
set -uo pipefail
command -v ssh-keyscan >/dev/null || { echo "ssh-keyscan is required on the hypervisor" >&2; exit 1; }
for ip in "$@"; do
  key_line=""
  for attempt in $(seq 1 30); do
    key_line="$(ssh-keyscan -T 3 -t ed25519 "$ip" 2>/dev/null | awk -v ip="$ip" '$2 == "ssh-ed25519" { print ip " " $2 " " $3; exit }')"
    if [[ -n "$key_line" ]]; then
      break
    fi
    sleep 2
  done
  if [[ -z "$key_line" ]]; then
    echo "could not discover the ed25519 SSH host key for $ip" >&2
    exit 1
  fi
  printf '%s\n' "$key_line"
done
`

	args := make([]pulumi.StringInput, len(addresses))
	for i, address := range addresses {
		args[i] = address
	}
	command := pulumi.Sprintf("bash -s -- %s", shellQuoteInputs(args))
	return remote.NewCommand(ctx, "discover-vm-host-keys-"+hostName, &remote.CommandArgs{
		Connection: hostConnection(host), Create: command, Stdin: pulumi.String(scanScript),
		AddPreviousOutputInEnv: pulumi.Bool(false), Logging: remote.LoggingNone,
	})
}

func hostConnection(host jumpHost) *remote.ConnectionArgs {
	return &remote.ConnectionArgs{
		Host:       pulumi.String(host.address),
		User:       pulumi.String(host.user),
		PrivateKey: pulumi.ToSecret(pulumi.String(host.privateKey)).(pulumi.StringOutput),
		HostKey:    host.hostKey,
	}
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
	return "", fmt.Errorf("no OpenSSH host key for %q (or alias %q) in %s; first connect to the hypervisor using its trusted SSH shortcut", address, alias, knownHostsPath)
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

func hostKeyOutput(scanOutput, address pulumi.StringOutput) pulumi.StringOutput {
	return pulumi.All(scanOutput, address).ApplyT(func(values []interface{}) (string, error) {
		return scannedHostKey(values[0].(string), values[1].(string))
	}).(pulumi.StringOutput)
}

func requireVerifiedNetworkAddress(nodeName string, routingVerified pulumi.BoolOutput, address pulumi.StringOutput) pulumi.StringOutput {
	// If routing is false, dependent Kubernetes commands receive an error instead of an IP.
	return pulumi.All(routingVerified, address).ApplyT(func(values []interface{}) (string, error) {
		verified, ok := values[0].(bool)
		if !ok || !verified {
			return "", fmt.Errorf("network stack has not verified routing for node %s", nodeName)
		}
		ip, ok := values[1].(string)
		if !ok || ip == "" {
			return "", fmt.Errorf("network stack did not export an IP address for node %s", nodeName)
		}
		return ip, nil
	}).(pulumi.StringOutput)
}

func shellQuoteInputs(args []pulumi.StringInput) pulumi.StringOutput {
	// Some arguments come from another Pulumi stack and are only known when Pulumi resolves its outputs.
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
	commandArgs := &remote.CommandArgs{
		Connection: connection(target),
		Create:     command,
		Stdin:      pulumi.String(script),
		Logging:    remote.LoggingNone,
	}
	return remote.NewCommand(ctx, name, commandArgs, options...)
}

func registerWorkerJoin(ctx *pulumi.Context, worker node, joinCommand pulumi.StringOutput, dependencies []pulumi.Resource) (*remote.Command, error) {
	create := joinCommand.ApplyT(func(join string) string {
		join = strings.TrimSpace(join)
		script := "if test -s /etc/kubernetes/kubelet.conf; then echo already-joined; else " + join + "; fi"
		return "sudo -n bash -lc " + shellQuote(script)
	}).(pulumi.StringOutput)
	return remote.NewCommand(ctx, "join-"+worker.name, &remote.CommandArgs{
		Connection:             connection(worker),
		Create:                 create,
		AddPreviousOutputInEnv: pulumi.Bool(false),
		Logging:                remote.LoggingNone,
	}, pulumi.DependsOn(dependencies))
}

func connection(target node) *remote.ConnectionArgs {
	vmKey := pulumi.ToSecret(pulumi.String(target.vmPrivateKey)).(pulumi.StringOutput)
	jumpKey := pulumi.ToSecret(pulumi.String(target.jump.privateKey)).(pulumi.StringOutput)
	return &remote.ConnectionArgs{
		Host:       target.address,
		User:       pulumi.String(target.sshUser),
		PrivateKey: vmKey,
		HostKey:    target.hostKey,
		Proxy: &remote.ProxyConnectionArgs{
			Host:       pulumi.String(target.jump.address),
			User:       pulumi.String(target.jump.user),
			PrivateKey: jumpKey,
			HostKey:    target.jump.hostKey,
		},
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
