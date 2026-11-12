package main

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/pulumi/pulumi-command/sdk/go/command/remote"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultHypervisorHost = "192.168.29.52"
	defaultSSHUser        = "void"
	defaultSSHKeyPath     = "/home/harish/.ssh/id_ed25519_voidlab"
	defaultPodCIDR        = "10.244.0.0/16"
	defaultCiliumVersion  = "1.21.0-pre.4"
	defaultCiliumCLI      = "v0.20.1"
)

type node struct {
	name    string
	address string
	hostKey string
}

type clusterConfig struct {
	hypervisorHost      string
	hypervisorKey       string
	sshUser             string
	privateKey          string
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
		keyPath := configString(cfg, "sshPrivateKeyPath", defaultSSHKeyPath)
		keyBytes, err := os.ReadFile(keyPath)
		if err != nil {
			return fmt.Errorf("read SSH private key %q: %w", keyPath, err)
		}
		privateKey := strings.TrimSpace(string(keyBytes))
		if privateKey == "" {
			return fmt.Errorf("SSH private key %q is empty", keyPath)
		}

		hostKeys := map[string]string{
			"hypervisorHostKey": configString(cfg, "hypervisorHostKey", ""),
			"cpHostKey":         configString(cfg, "cpHostKey", ""),
			"worker1HostKey":    configString(cfg, "worker1HostKey", ""),
			"worker2HostKey":    configString(cfg, "worker2HostKey", ""),
			"worker3HostKey":    configString(cfg, "worker3HostKey", ""),
		}
		for keyName, hostKey := range hostKeys {
			if !isSSHKey(hostKey) {
				return fmt.Errorf("set %s to the verified OpenSSH public host key (key type and base64 key only); host-key verification is required", keyName)
			}
		}

		cluster := clusterConfig{
			hypervisorHost: configString(cfg, "hypervisorHost", defaultHypervisorHost),
			hypervisorKey:  hostKeys["hypervisorHostKey"],
			sshUser:        configString(cfg, "sshUser", defaultSSHUser),
			privateKey:     privateKey,
			controlPlane:   node{name: "cp", address: configString(cfg, "controlPlaneIP", "10.20.0.10"), hostKey: hostKeys["cpHostKey"]},
			workers: []node{
				{name: "worker-1", address: configString(cfg, "worker1IP", "10.20.0.11"), hostKey: hostKeys["worker1HostKey"]},
				{name: "worker-2", address: configString(cfg, "worker2IP", "10.20.0.12"), hostKey: hostKeys["worker2HostKey"]},
				{name: "worker-3", address: configString(cfg, "worker3IP", "10.20.0.13"), hostKey: hostKeys["worker3HostKey"]},
			},
			podCIDR:             configString(cfg, "podCIDR", defaultPodCIDR),
			ciliumVersion:       configString(cfg, "ciliumVersion", defaultCiliumVersion),
			ciliumCLIVersion:    configString(cfg, "ciliumCLIVersion", defaultCiliumCLI),
			allowOneCPU:         cfg.GetBool("allowSingleCPUControlPlane"),
			joinTokenGeneration: configString(cfg, "joinTokenGeneration", "1"),
		}

		preflightScript, err := readScript("preflight.sh")
		if err != nil {
			return err
		}
		setupScript, err := readScript("install-node.sh")
		if err != nil {
			return err
		}
		preflights := make([]pulumi.Resource, 0, 4)
		for _, current := range cluster.nodes() {
			allowOneCPU := "false"
			if current.name == "cp" && cluster.allowOneCPU {
				allowOneCPU = "true"
			}
			check, err := runScript(ctx, "preflight-"+current.name, cluster, current, preflightScript,
				[]string{current.name, current.address, allowOneCPU}, nil, false)
			if err != nil {
				return fmt.Errorf("register %s preflight: %w", current.name, err)
			}
			preflights = append(preflights, check)
		}

		setupResources := make([]pulumi.Resource, 0, 4)
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
		ciliumInstall, err := runScript(ctx, "install-cilium", cluster, cluster.controlPlane, ciliumScript,
			[]string{cluster.ciliumVersion, cluster.ciliumCLIVersion}, joinResources, false)
		if err != nil {
			return fmt.Errorf("register Cilium installation: %w", err)
		}

		readyScript, err := readScript("wait-for-nodes.sh")
		if err != nil {
			return err
		}
		registration, err := runScript(ctx, "confirm-four-nodes", cluster, cluster.controlPlane, readyScript,
			nil, []pulumi.Resource{ciliumInstall}, false)
		if err != nil {
			return fmt.Errorf("register cluster readiness check: %w", err)
		}

		kubeconfigScript, err := readScript("export-kubeconfig.sh")
		if err != nil {
			return err
		}
		kubeconfig, err := runScript(ctx, "export-kubeconfig", cluster, cluster.controlPlane, kubeconfigScript,
			[]string{cluster.controlPlane.address}, []pulumi.Resource{registration}, true)
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
		ctx.Export("cni", pulumi.String("Cilium "+cluster.ciliumVersion))
		ctx.Export("sshTunnel", pulumi.String(fmt.Sprintf("k -N -L 16443:%s:6443", cluster.controlPlane.address)))
		ctx.Export("kubeconfigBase64", kubeconfig.Stdout)
		return nil
	})
}

func (c clusterConfig) nodes() []node {
	return append([]node{c.controlPlane}, c.workers...)
}

func runScript(ctx *pulumi.Context, name string, cluster clusterConfig, target node, script string, args []string, dependencies []pulumi.Resource, secretStdout bool) (*remote.Command, error) {
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
	return remote.NewCommand(ctx, name, &remote.CommandArgs{
		Connection: connection(cluster, target),
		Create:     pulumi.String(command),
		Stdin:      pulumi.String(script),
		Logging:    remote.LoggingNone,
	}, options...)
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
	secretKey := pulumi.ToSecret(pulumi.String(cluster.privateKey)).(pulumi.StringOutput)
	return &remote.ConnectionArgs{
		Host:       pulumi.String(target.address),
		User:       pulumi.String(cluster.sshUser),
		PrivateKey: secretKey,
		HostKey:    pulumi.String(target.hostKey),
		Proxy: &remote.ProxyConnectionArgs{
			Host:       pulumi.String(cluster.hypervisorHost),
			User:       pulumi.String(cluster.sshUser),
			PrivateKey: secretKey,
			HostKey:    pulumi.String(cluster.hypervisorKey),
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
