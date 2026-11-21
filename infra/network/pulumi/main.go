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

	"github.com/pulumi/pulumi-command/sdk/go/command/remote"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const defaultKubernetesStack = "snharish85-gmail-com-org/voidlab-kubernetes/k8"

type serverConfig struct {
	Name              string `json:"name"`
	Role              string `json:"role"`
	Address           string `json:"address"`
	SSHAddress        string `json:"sshAddress"`
	SSHUser           string `json:"sshUser"`
	SSHPrivateKeyPath string `json:"sshPrivateKeyPath"`
}

type server struct {
	name       string
	role       string
	roleOutput pulumi.StringOutput
	address    pulumi.StringOutput
	sshAddress string
	sshUser    string
	privateKey string
	hostKey    pulumi.StringPtrInput
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-network")
		var configured []serverConfig
		if err := cfg.GetObject("servers", &configured); err != nil {
			return fmt.Errorf("read network server configuration: %w", err)
		}
		if err := validateServers(configured); err != nil {
			return err
		}

		k8Stack, err := pulumi.NewStackReference(ctx, "kubernetes-stack", &pulumi.StackReferenceArgs{
			Name: pulumi.String(configString(cfg, "kubernetesStack", defaultKubernetesStack)),
		})
		if err != nil {
			return fmt.Errorf("reference Kubernetes stack: %w", err)
		}
		podCIDR := k8Stack.GetStringOutput(pulumi.String("podCIDR")).ApplyT(func(value string) (string, error) {
			prefix, err := netip.ParsePrefix(value)
			if err != nil || !prefix.Addr().Is4() {
				return "", fmt.Errorf("Kubernetes stack podCIDR %q must be an IPv4 CIDR", value)
			}
			return prefix.Masked().String(), nil
		}).(pulumi.StringOutput)

		servers := make([]server, 0, len(configured))
		for _, spec := range configured {
			sshAddress := spec.SSHAddress
			if sshAddress == "" {
				sshAddress = spec.Address
			}
			privateKey, err := readPrivateKey(spec.SSHPrivateKeyPath)
			if err != nil {
				return fmt.Errorf("read %s SSH key: %w", spec.Name, err)
			}
			hostKey, err := readKnownHostKey(sshAddress)
			if err != nil {
				return fmt.Errorf("resolve %s SSH host key: %w", spec.Name, err)
			}
			address := requireMatchingAddress(spec.Name, spec.Address,
				k8Stack.GetStringOutput(pulumi.String("nodeIP_"+strings.ReplaceAll(spec.Name, "-", "_"))))
			role := requireMatchingRole(spec.Name, spec.Role,
				k8Stack.GetStringOutput(pulumi.String("nodeRole_"+strings.ReplaceAll(spec.Name, "-", "_"))))
			servers = append(servers, server{
				name: spec.Name, role: spec.Role, roleOutput: role, address: address, sshAddress: sshAddress, sshUser: spec.SSHUser,
				privateKey: privateKey, hostKey: pulumi.String(hostKey),
			})
		}

		script, err := readScript("configure-kubernetes-network.sh")
		if err != nil {
			return err
		}
		changes := make([]*remote.Command, 0, len(servers))
		for i := range servers {
			peer := servers[1-i]
			command, err := configureServer(ctx, servers[i], peer, podCIDR, script)
			if err != nil {
				return fmt.Errorf("register network configuration for %s: %w", servers[i].name, err)
			}
			changes = append(changes, command)
		}

		nodeIPs := pulumi.Map{}
		for _, current := range servers {
			nodeIPs[current.name] = current.address
		}
		ctx.Export("nodeIPs", nodeIPs)
		ctx.Export("networkReady", pulumi.All(commandOutputs(changes)...).ApplyT(func([]interface{}) bool { return true }).(pulumi.BoolOutput))
		return nil
	})
}

func validateServers(servers []serverConfig) error {
	if len(servers) == 0 {
		return fmt.Errorf("no servers are configured; set voidlab-network:servers[0] and [1] with the commands in README.md")
	}
	if len(servers) != 2 {
		return fmt.Errorf("servers must contain exactly the two Kubernetes servers")
	}
	seenNames, seenAddresses := map[string]bool{}, map[string]bool{}
	for _, current := range servers {
		if current.Name == "" || current.SSHUser == "" || current.SSHPrivateKeyPath == "" {
			return fmt.Errorf("each server must set name, role, sshUser, and sshPrivateKeyPath")
		}
		if current.Role != "control-plane" && current.Role != "worker" {
			return fmt.Errorf("server %s role must be control-plane or worker", current.Name)
		}
		if seenNames[current.Name] {
			return fmt.Errorf("server name %q is configured more than once", current.Name)
		}
		seenNames[current.Name] = true
		address, err := netip.ParseAddr(current.Address)
		if err != nil || !address.Is4() {
			return fmt.Errorf("server %s address %q must be an IPv4 Kubernetes node address", current.Name, current.Address)
		}
		if seenAddresses[current.Address] {
			return fmt.Errorf("server address %q is configured more than once", current.Address)
		}
		seenAddresses[current.Address] = true
		sshAddress := current.SSHAddress
		if sshAddress == "" {
			sshAddress = current.Address
		}
		if address, err := netip.ParseAddr(sshAddress); err != nil || !address.Is4() {
			return fmt.Errorf("server %s sshAddress %q must be an IPv4 address", current.Name, sshAddress)
		}
	}
	return nil
}

func requireMatchingAddress(name, expected string, actual pulumi.StringOutput) pulumi.StringOutput {
	return actual.ApplyT(func(value string) (string, error) {
		if value != expected {
			return "", fmt.Errorf("Kubernetes stack address for %s is %q, network config says %q", name, value, expected)
		}
		return value, nil
	}).(pulumi.StringOutput)
}

func requireMatchingRole(name, expected string, actual pulumi.StringOutput) pulumi.StringOutput {
	return actual.ApplyT(func(value string) (string, error) {
		if value != expected {
			return "", fmt.Errorf("Kubernetes stack role for %s is %q, network config says %q", name, value, expected)
		}
		return value, nil
	}).(pulumi.StringOutput)
}

func configureServer(ctx *pulumi.Context, current, peer server, podCIDR pulumi.StringOutput, script string) (*remote.Command, error) {
	return remote.NewCommand(ctx, "configure-network-"+current.name, &remote.CommandArgs{
		Connection: &remote.ConnectionArgs{
			Host: pulumi.String(current.sshAddress), User: pulumi.String(current.sshUser),
			PrivateKey: pulumi.ToSecret(pulumi.String(current.privateKey)).(pulumi.StringOutput), HostKey: current.hostKey,
		},
		Create: pulumi.Sprintf("sudo -n bash -s -- %s", shellQuoteInputs([]pulumi.StringInput{
			current.address,
			peer.address,
			peer.roleOutput,
			podCIDR,
		})),
		Stdin:                  pulumi.String(script),
		AddPreviousOutputInEnv: pulumi.Bool(false),
		Logging:                remote.LoggingNone,
	})
}

func commandOutputs(commands []*remote.Command) []any {
	outputs := make([]any, 0, len(commands))
	for _, command := range commands {
		outputs = append(outputs, command.Stdout)
	}
	return outputs
}

func readScript(name string) (string, error) {
	contents, err := os.ReadFile(filepath.Join("scripts", name))
	if err != nil {
		return "", fmt.Errorf("read %s: %w", filepath.Join("scripts", name), err)
	}
	return string(contents), nil
}

func readPrivateKey(path string) (string, error) {
	path = expandHome(path)
	keyBytes, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read SSH private key %q: %w", path, err)
	}
	key := strings.TrimSpace(string(keyBytes))
	if key == "" {
		return "", fmt.Errorf("SSH private key %q is empty", path)
	}
	return key, nil
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
		if len(fields) >= 3 && !strings.HasPrefix(fields[0], "#") {
			key := fields[1] + " " + fields[2]
			if isSSHKey(key) {
				return key, nil
			}
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

func configString(cfg *config.Config, key, fallback string) string {
	if value := cfg.Get(key); value != "" {
		return value
	}
	return fallback
}

func expandHome(path string) string {
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, strings.TrimPrefix(path, "~/"))
	}
	return path
}
