package main

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"

	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/pulumi/pulumi-command/sdk/go/command/remote"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultHypervisorHost = "192.168.29.52"
	defaultSSHUser        = "void"
	defaultSSHKeyPath     = "/Users/harish/.ssh/voidlab"
	defaultPodCIDR        = "10.244.0.0/16"
	defaultCiliumVersion  = "1.21.0-pre.4"
	defaultCiliumCLI      = "v0.20.1"
)

type node struct {
	name    string
	address string
	hostKey pulumi.StringPtrInput
	jump    jumpHost
}

type jumpHost struct {
	address    string
	user       string
	privateKey string
	hostKey    pulumi.StringPtrInput
}

type clusterConfig struct {
	vmSSHUser           string
	vmPrivateKey        string
	host1VMSubnet       string
	host2VMSubnet       string
	host1TunnelAddress  string
	host2TunnelAddress  string
	controlPlane        node
	workers             []node
	podCIDR             string
	ciliumVersion       string
	ciliumCLIVersion    string
	allowOneCPU         bool
	joinTokenGeneration string
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-kubernetes")
		vmKeyPath := configString(cfg, "vmSSHPrivateKeyPath", defaultSSHKeyPath)
		vmPrivateKey, err := readPrivateKey(vmKeyPath)
		if err != nil {
			return fmt.Errorf("read VM SSH private key: %w", err)
		}
		host1KeyPath := configString(cfg, "host1SSHPrivateKeyPath", "/Users/harish/.ssh/voidlab")
		host1PrivateKey, err := readPrivateKey(host1KeyPath)
		if err != nil {
			return fmt.Errorf("read host1 SSH private key: %w", err)
		}
		host2KeyPath := configString(cfg, "host2SSHPrivateKeyPath", "/Users/harish/.ssh/dark")
		host2PrivateKey, err := readPrivateKey(host2KeyPath)
		if err != nil {
			return fmt.Errorf("read host2 SSH private key: %w", err)
		}

		host1Address := configString(cfg, "hypervisorHost1", defaultHypervisorHost)
		host2Address := configString(cfg, "hypervisorHost2", "192.168.29.81")
		host1Key, err := readKnownHostKey(host1Address, "k")
		if err != nil {
			return fmt.Errorf("resolve host1 SSH host key from local known_hosts: %w", err)
		}
		host2Key, err := readKnownHostKey(host2Address, "k1")
		if err != nil {
			return fmt.Errorf("resolve host2 SSH host key from local known_hosts: %w", err)
		}

		host1 := jumpHost{
			address:    host1Address,
			user:       configString(cfg, "hypervisorHost1User", "void"),
			privateKey: host1PrivateKey,
			hostKey:    pulumi.String(host1Key),
		}
		host2 := jumpHost{
			address:    host2Address,
			user:       configString(cfg, "hypervisorHost2User", "dark"),
			privateKey: host2PrivateKey,
			hostKey:    pulumi.String(host2Key),
		}
		vmKeyScans, err := discoverVMHostKeys(ctx, host1, host2,
			[]string{configString(cfg, "controlPlaneIP", "10.20.0.10"), configString(cfg, "worker1IP", "10.20.0.11"), configString(cfg, "worker2IP", "10.20.0.12")},
			[]string{configString(cfg, "worker3IP", "10.21.0.13"), configString(cfg, "worker4IP", "10.21.0.14"), configString(cfg, "worker5IP", "10.21.0.15")})
		if err != nil {
			return fmt.Errorf("register VM host-key discovery: %w", err)
		}
		cluster := clusterConfig{
			vmSSHUser:          configString(cfg, "vmSSHUser", defaultSSHUser),
			vmPrivateKey:       vmPrivateKey,
			host1VMSubnet:      configString(cfg, "host1VMSubnet", "10.20.0.0/24"),
			host2VMSubnet:      configString(cfg, "host2VMSubnet", "10.21.0.0/24"),
			host1TunnelAddress: configString(cfg, "host1TunnelAddress", "10.254.29.1"),
			host2TunnelAddress: configString(cfg, "host2TunnelAddress", "10.254.29.2"),
			controlPlane: node{name: "cp", address: configString(cfg, "controlPlaneIP", "10.20.0.10"), hostKey: vmKeyScans[0].Stdout.ApplyT(func(output string) (string, error) {
				return scannedHostKey(output, configString(cfg, "controlPlaneIP", "10.20.0.10"))
			}).(pulumi.StringOutput), jump: host1},
			workers: []node{
				{name: "worker-1", address: configString(cfg, "worker1IP", "10.20.0.11"), hostKey: vmKeyScans[0].Stdout.ApplyT(func(output string) (string, error) {
					return scannedHostKey(output, configString(cfg, "worker1IP", "10.20.0.11"))
				}).(pulumi.StringOutput), jump: host1},
				{name: "worker-2", address: configString(cfg, "worker2IP", "10.20.0.12"), hostKey: vmKeyScans[0].Stdout.ApplyT(func(output string) (string, error) {
					return scannedHostKey(output, configString(cfg, "worker2IP", "10.20.0.12"))
				}).(pulumi.StringOutput), jump: host1},
				{name: "worker-3", address: configString(cfg, "worker3IP", "10.21.0.13"), hostKey: vmKeyScans[1].Stdout.ApplyT(func(output string) (string, error) {
					return scannedHostKey(output, configString(cfg, "worker3IP", "10.21.0.13"))
				}).(pulumi.StringOutput), jump: host2},
				{name: "worker-4", address: configString(cfg, "worker4IP", "10.21.0.14"), hostKey: vmKeyScans[1].Stdout.ApplyT(func(output string) (string, error) {
					return scannedHostKey(output, configString(cfg, "worker4IP", "10.21.0.14"))
				}).(pulumi.StringOutput), jump: host2},
				{name: "worker-5", address: configString(cfg, "worker5IP", "10.21.0.15"), hostKey: vmKeyScans[1].Stdout.ApplyT(func(output string) (string, error) {
					return scannedHostKey(output, configString(cfg, "worker5IP", "10.21.0.15"))
				}).(pulumi.StringOutput), jump: host2},
			},
			podCIDR:             configString(cfg, "podCIDR", defaultPodCIDR),
			ciliumVersion:       configString(cfg, "ciliumVersion", defaultCiliumVersion),
			ciliumCLIVersion:    configString(cfg, "ciliumCLIVersion", defaultCiliumCLI),
			allowOneCPU:         cfg.GetBool("allowSingleCPUControlPlane"),
			joinTokenGeneration: configString(cfg, "joinTokenGeneration", "1"),
		}

		prepareWireGuard, err := readScript("prepare-wireguard-host.sh")
		if err != nil {
			return err
		}
		host1WireGuardKey, err := runHostScript(ctx, "prepare-wireguard-host1", host1, prepareWireGuard, nil, nil, false)
		if err != nil {
			return fmt.Errorf("register host1 WireGuard preparation: %w", err)
		}
		host2WireGuardKey, err := runHostScript(ctx, "prepare-wireguard-host2", host2, prepareWireGuard, nil, nil, false)
		if err != nil {
			return fmt.Errorf("register host2 WireGuard preparation: %w", err)
		}
		configureWireGuard, err := readScript("configure-wireguard-host.sh")
		if err != nil {
			return err
		}
		host1WireGuard, err := configureHostWireGuard(ctx, "configure-wireguard-host1", host1, configureWireGuard,
			[]string{cluster.host1VMSubnet, cluster.host2VMSubnet, cluster.host1TunnelAddress, cluster.host2TunnelAddress, host2.address},
			host2WireGuardKey.Stdout, []pulumi.Resource{host1WireGuardKey, host2WireGuardKey})
		if err != nil {
			return fmt.Errorf("register host1 WireGuard routes: %w", err)
		}
		host2WireGuard, err := configureHostWireGuard(ctx, "configure-wireguard-host2", host2, configureWireGuard,
			[]string{cluster.host2VMSubnet, cluster.host1VMSubnet, cluster.host2TunnelAddress, cluster.host1TunnelAddress, host1.address},
			host1WireGuardKey.Stdout, []pulumi.Resource{host1WireGuardKey, host2WireGuardKey})
		if err != nil {
			return fmt.Errorf("register host2 WireGuard routes: %w", err)
		}
		libvirtHookScript, err := readScript("install-libvirt-forwarding-hook.sh")
		if err != nil {
			return err
		}
		host1LibvirtForwarding, err := runHostScript(ctx, "install-libvirt-forwarding-host1", host1, libvirtHookScript,
			[]string{cluster.host1VMSubnet, cluster.host2VMSubnet, "voidlab-network", "wg-voidlab"}, []pulumi.Resource{host1WireGuard}, false)
		if err != nil {
			return fmt.Errorf("register host1 libvirt forwarding hook: %w", err)
		}
		host2LibvirtForwarding, err := runHostScript(ctx, "install-libvirt-forwarding-host2", host2, libvirtHookScript,
			[]string{cluster.host2VMSubnet, cluster.host1VMSubnet, "voidlab-network", "wg-voidlab"}, []pulumi.Resource{host2WireGuard}, false)
		if err != nil {
			return fmt.Errorf("register host2 libvirt forwarding hook: %w", err)
		}
		applyLibvirtRulesScript, err := readScript("apply-libvirt-forwarding-rules.sh")
		if err != nil {
			return err
		}
		host1LibvirtRules, err := runHostScript(ctx, "apply-libvirt-forwarding-rules-host1", host1, applyLibvirtRulesScript,
			[]string{cluster.host1VMSubnet, cluster.host2VMSubnet, "voidlab-network", "wg-voidlab"}, []pulumi.Resource{host1LibvirtForwarding}, false)
		if err != nil {
			return fmt.Errorf("register host1 libvirt forwarding rules: %w", err)
		}
		host2LibvirtRules, err := runHostScript(ctx, "apply-libvirt-forwarding-rules-host2", host2, applyLibvirtRulesScript,
			[]string{cluster.host2VMSubnet, cluster.host1VMSubnet, "voidlab-network", "wg-voidlab"}, []pulumi.Resource{host2LibvirtForwarding}, false)
		if err != nil {
			return fmt.Errorf("register host2 libvirt forwarding rules: %w", err)
		}
		routingResources := []pulumi.Resource{host1LibvirtRules, host2LibvirtRules}

		preflightScript, err := readScript("preflight.sh")
		if err != nil {
			return err
		}
		setupScript, err := readScript("install-node.sh")
		if err != nil {
			return err
		}
		preflights := make([]pulumi.Resource, 0, 6)
		for _, current := range cluster.nodes() {
			allowOneCPU := "false"
			if current.name == "cp" && cluster.allowOneCPU {
				allowOneCPU = "true"
			}
			nodeAddresses := make([]string, 0, len(cluster.nodes()))
			for _, node := range cluster.nodes() {
				nodeAddresses = append(nodeAddresses, node.address)
			}
			check, err := runScript(ctx, "preflight-"+current.name, cluster, current, preflightScript,
				[]string{current.name, current.address, allowOneCPU, strings.Join(nodeAddresses, ",")}, routingResources, false)
			if err != nil {
				return fmt.Errorf("register %s preflight: %w", current.name, err)
			}
			preflights = append(preflights, check)
		}

		setupResources := make([]pulumi.Resource, 0, 6)
		for _, current := range cluster.nodes() {
			setup, err := runScript(ctx, "install-"+current.name, cluster, current, setupScript,
				[]string{"v1.37"}, preflights, false)
			if err != nil {
				return fmt.Errorf("register %s Kubernetes setup: %w", current.name, err)
			}
			setupResources = append(setupResources, setup)
		}

		initScript, err := readScript("init-control-plane.sh")
		if err != nil {
			return err
		}
		initArgs := []string{cluster.controlPlane.address, cluster.podCIDR, "false", cluster.joinTokenGeneration}
		if cluster.allowOneCPU {
			initArgs[2] = "true"
		}
		controlPlaneInit, err := runScript(ctx, "init-control-plane", cluster, cluster.controlPlane, initScript,
			initArgs, setupResources, true)
		if err != nil {
			return fmt.Errorf("register kubeadm init: %w", err)
		}

		joinResources := make([]pulumi.Resource, 0, len(cluster.workers))
		for _, worker := range cluster.workers {
			join, err := registerWorkerJoin(ctx, cluster, worker, controlPlaneInit.Stdout, []pulumi.Resource{controlPlaneInit})
			if err != nil {
				return fmt.Errorf("register %s join: %w", worker.name, err)
			}
			joinResources = append(joinResources, join)
		}

		ciliumScript, err := readScript("install-cilium.sh")
		if err != nil {
			return err
		}
		ciliumInstall, err := runScriptWithoutPreviousOutputEnv(ctx, "install-cilium", cluster, cluster.controlPlane, ciliumScript,
			[]string{cluster.ciliumVersion, cluster.ciliumCLIVersion, cluster.controlPlane.address}, joinResources, false)
		if err != nil {
			return fmt.Errorf("register Cilium installation: %w", err)
		}

		readyScript, err := readScript("wait-for-nodes.sh")
		if err != nil {
			return err
		}
		registration, err := runScript(ctx, "confirm-six-nodes", cluster, cluster.controlPlane, readyScript,
			[]string{cluster.joinTokenGeneration}, []pulumi.Resource{ciliumInstall}, false)
		if err != nil {
			return fmt.Errorf("register cluster readiness check: %w", err)
		}

		kubeconfigScript, err := readScript("export-kubeconfig.sh")
		if err != nil {
			return err
		}
		kubeconfig, err := runScript(ctx, "export-kubeconfig", cluster, cluster.controlPlane, kubeconfigScript,
			[]string{cluster.controlPlane.address, cluster.joinTokenGeneration}, []pulumi.Resource{registration}, true)
		if err != nil {
			return fmt.Errorf("register kubeconfig export: %w", err)
		}

		names, addresses := pulumi.Map{}, pulumi.Map{}
		for _, current := range cluster.nodes() {
			names[current.name] = pulumi.String(current.name)
			addresses[current.name] = pulumi.String(current.address)
		}
		ctx.Export("nodeNames", names)
		ctx.Export("nodeIPs", addresses)
		ctx.Export("kubernetesVersion", pulumi.String("1.37"))
		ctx.Export("podCIDR", pulumi.String(cluster.podCIDR))
		ctx.Export("cni", pulumi.String("Cilium "+cluster.ciliumVersion+" with kube-proxy replacement"))
		ctx.Export("sshTunnel", pulumi.String(fmt.Sprintf("k -N -L 16443:%s:6443", cluster.controlPlane.address)))
		ctx.Export("kubeconfigBase64", kubeconfig.Stdout)
		return nil
	})
}

func (c clusterConfig) nodes() []node {
	return append([]node{c.controlPlane}, c.workers...)
}

func discoverVMHostKeys(ctx *pulumi.Context, host1, host2 jumpHost, host1IPs, host2IPs []string) ([]*remote.Command, error) {
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

	newScan := func(name string, host jumpHost, addresses []string) (*remote.Command, error) {
		command := "bash -s --"
		for _, address := range addresses {
			command += " " + shellQuote(address)
		}
		return remote.NewCommand(ctx, name, &remote.CommandArgs{
			Connection:             hostConnection(host),
			Create:                 pulumi.String(command),
			Stdin:                  pulumi.String(scanScript),
			AddPreviousOutputInEnv: pulumi.Bool(false),
			Logging:                remote.LoggingNone,
		})
	}

	host1Scan, err := newScan("discover-vm-host-keys-host1", host1, host1IPs)
	if err != nil {
		return nil, fmt.Errorf("register host1 VM host-key scan: %w", err)
	}
	host2Scan, err := newScan("discover-vm-host-keys-host2", host2, host2IPs)
	if err != nil {
		return nil, fmt.Errorf("register host2 VM host-key scan: %w", err)
	}
	return []*remote.Command{host1Scan, host2Scan}, nil
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

func runScript(ctx *pulumi.Context, name string, cluster clusterConfig, target node, script string, args []string, dependencies []pulumi.Resource, secretStdout bool) (*remote.Command, error) {
	return runScriptWithPreviousOutputEnv(ctx, name, cluster, target, script, args, dependencies, secretStdout, true)
}

func runScriptWithoutPreviousOutputEnv(ctx *pulumi.Context, name string, cluster clusterConfig, target node, script string, args []string, dependencies []pulumi.Resource, secretStdout bool) (*remote.Command, error) {
	return runScriptWithPreviousOutputEnv(ctx, name, cluster, target, script, args, dependencies, secretStdout, false)
}

func runScriptWithPreviousOutputEnv(ctx *pulumi.Context, name string, cluster clusterConfig, target node, script string, args []string, dependencies []pulumi.Resource, secretStdout, addPreviousOutputInEnv bool) (*remote.Command, error) {
	command := "sudo -n bash -s"
	if len(args) != 0 {
		command += " -- "
		quoted := make([]string, 0, len(args))
		for _, arg := range args {
			quoted = append(quoted, shellQuote(arg))
		}
		command += strings.Join(quoted, " ")
	}
	options := []pulumi.ResourceOption{pulumi.AdditionalSecretOutputs([]string{"stdout"})}
	if !secretStdout {
		options = nil
	}
	if len(dependencies) != 0 {
		options = append(options, pulumi.DependsOn(dependencies))
	}
	commandArgs := &remote.CommandArgs{
		Connection: connection(cluster, target),
		Create:     pulumi.String(command),
		Stdin:      pulumi.String(script),
		Logging:    remote.LoggingNone,
	}
	if !addPreviousOutputInEnv {
		commandArgs.AddPreviousOutputInEnv = pulumi.Bool(false)
	}
	return remote.NewCommand(ctx, name, commandArgs, options...)
}

func registerWorkerJoin(ctx *pulumi.Context, cluster clusterConfig, worker node, joinCommand pulumi.StringOutput, dependencies []pulumi.Resource) (*remote.Command, error) {
	create := joinCommand.ApplyT(func(join string) string {
		join = strings.TrimSpace(join)
		script := "if test -s /etc/kubernetes/kubelet.conf; then echo already-joined; else " + join + "; fi"
		return "sudo -n bash -lc " + shellQuote(script)
	}).(pulumi.StringOutput)
	return remote.NewCommand(ctx, "join-"+worker.name, &remote.CommandArgs{
		Connection:             connection(cluster, worker),
		Create:                 create,
		AddPreviousOutputInEnv: pulumi.Bool(false),
		Logging:                remote.LoggingNone,
	}, pulumi.DependsOn(dependencies))
}

func connection(cluster clusterConfig, target node) *remote.ConnectionArgs {
	vmKey := pulumi.ToSecret(pulumi.String(cluster.vmPrivateKey)).(pulumi.StringOutput)
	jumpKey := pulumi.ToSecret(pulumi.String(target.jump.privateKey)).(pulumi.StringOutput)
	return &remote.ConnectionArgs{
		Host:       pulumi.String(target.address),
		User:       pulumi.String(cluster.vmSSHUser),
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

func runHostScript(ctx *pulumi.Context, name string, host jumpHost, script string, args []string, dependencies []pulumi.Resource, secretStdout bool) (*remote.Command, error) {
	return runHostCommand(ctx, name, host, pulumi.String(hostScriptCommand(args)), pulumi.String(script), dependencies, secretStdout)
}

func configureHostWireGuard(ctx *pulumi.Context, name string, host jumpHost, script string, args []string, peerPublicKey pulumi.StringOutput, dependencies []pulumi.Resource) (*remote.Command, error) {
	create := peerPublicKey.ApplyT(func(publicKey string) string {
		commandArgs := append(append([]string(nil), args...), strings.TrimSpace(publicKey))
		return hostScriptCommand(commandArgs)
	}).(pulumi.StringOutput)
	return runHostCommand(ctx, name, host, create, pulumi.String(script), dependencies, false)
}

func hostScriptCommand(args []string) string {
	command := "sudo -n bash -s"
	if len(args) != 0 {
		quoted := make([]string, 0, len(args))
		for _, arg := range args {
			quoted = append(quoted, shellQuote(arg))
		}
		command += " -- " + strings.Join(quoted, " ")
	}
	return command
}

func runHostCommand(ctx *pulumi.Context, name string, host jumpHost, create pulumi.StringInput, script pulumi.StringInput, dependencies []pulumi.Resource, secretStdout bool) (*remote.Command, error) {
	options := []pulumi.ResourceOption{pulumi.AdditionalSecretOutputs([]string{"stdout"})}
	if !secretStdout {
		options = nil
	}
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
