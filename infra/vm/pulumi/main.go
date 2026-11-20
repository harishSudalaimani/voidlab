package main

import (
	"encoding/json"
	"fmt"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/harish/voidlab/infra/inventory"
	"github.com/pulumi/pulumi-terraform-provider/sdks/go/libvirt/libvirt"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultImageURL = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
	bytesPerGiB     = 1024 * 1024 * 1024
)

type vmSpec struct {
	name        string
	role        string
	ip          string
	mac         string
	vcpus       int
	memoryMiB   int
	diskGiB     int
	dataDiskGiB int
}

type settings struct {
	networkName   string
	cidr          string
	gateway       string
	dhcpStart     string
	dhcpEnd       string
	poolName      string
	poolPath      string
	dataPoolName  string
	dataPoolPath  string
	imageURL      string
	publicKey     string
	publicKeyPath string
	timezone      string
	vms           []vmSpec
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-vm")
		var host inventory.Host
		if err := cfg.GetObject("host", &host); err != nil {
			return fmt.Errorf("read host settings: %w", err)
		}
		publicKeyPath := host.SSHPublicKeyPath
		keyBytes, err := os.ReadFile(publicKeyPath)
		if err != nil {
			return fmt.Errorf("read SSH public key %q: %w", publicKeyPath, err)
		}
		publicKey := strings.TrimSpace(string(keyBytes))
		if publicKey == "" || (!strings.HasPrefix(publicKey, "ssh-") && !strings.HasPrefix(publicKey, "ecdsa-")) {
			return fmt.Errorf("%q does not contain an OpenSSH public key", publicKeyPath)
		}

		vms := make([]vmSpec, 0, len(host.Nodes))
		for i, node := range host.Nodes {
			vms = append(vms, makeVMSpec(node, i))
		}
		imageURL := host.UbuntuImageURL
		if imageURL == "" {
			imageURL = defaultImageURL
		}
		timezone := host.Timezone
		if timezone == "" {
			timezone = "Asia/Kolkata"
		}
		dataPoolName := host.DataPoolName
		if dataPoolName == "" {
			dataPoolName = "voidlab-data-pool"
		}
		cfgSettings := settings{
			networkName:   host.NetworkName,
			cidr:          host.NetworkCIDR,
			gateway:       host.Gateway,
			dhcpStart:     host.DHCPRangeStart,
			dhcpEnd:       host.DHCPRangeEnd,
			poolName:      host.PoolName,
			poolPath:      host.PoolPath,
			dataPoolName:  dataPoolName,
			dataPoolPath:  host.DataPoolPath,
			imageURL:      imageURL,
			publicKey:     publicKey,
			publicKeyPath: publicKeyPath,
			timezone:      timezone,
			vms:           vms,
		}
		if err := validateSettings(cfgSettings); err != nil {
			return err
		}
		providerURI, err := libvirtURI(host)
		if err != nil {
			return err
		}
		provider, err := libvirt.NewProvider(ctx, "libvirt-"+host.Name, &libvirt.ProviderArgs{Uri: pulumi.StringPtr(providerURI)})
		if err != nil {
			return fmt.Errorf("configure libvirt connection for %s: %w", host.Name, err)
		}

		pool, err := libvirt.NewPool(ctx, "voidlab-pool", &libvirt.PoolArgs{
			Name: pulumi.String(cfgSettings.poolName),
			Type: pulumi.String("dir"),
			Target: &libvirt.PoolTargetArgs{
				Path: pulumi.String(cfgSettings.poolPath),
			},
			Create: &libvirt.PoolCreateArgs{
				Autostart: pulumi.Bool(true),
				Build:     pulumi.Bool(true),
				Start:     pulumi.Bool(true),
			},
		}, pulumi.Provider(provider))
		if err != nil {
			return fmt.Errorf("create libvirt storage pool: %w", err)
		}

		baseImage, err := libvirt.NewVolume(ctx, "ubuntu-2404-base", &libvirt.VolumeArgs{
			Name: pulumi.String("ubuntu-2404-base.qcow2"),
			Pool: pulumi.String(cfgSettings.poolName),
			Target: &libvirt.VolumeTargetArgs{
				Format: &libvirt.VolumeTargetFormatArgs{Type: pulumi.String("qcow2")},
			},
			Create: &libvirt.VolumeCreateArgs{
				Content: &libvirt.VolumeCreateContentArgs{Url: pulumi.String(cfgSettings.imageURL)},
			},
		}, pulumi.DependsOn([]pulumi.Resource{pool}), pulumi.Provider(provider))
		if err != nil {
			return fmt.Errorf("create Ubuntu base image volume: %w", err)
		}

		var dataPool *libvirt.Pool
		needsDataPool := false
		for _, vm := range cfgSettings.vms {
			if vm.dataDiskGiB > 0 {
				needsDataPool = true
				break
			}
		}
		if needsDataPool {
			if cfgSettings.dataPoolPath == "" {
				return fmt.Errorf("dataPoolPath must be configured when a node has a data disk")
			}
			dataPool, err = libvirt.NewPool(ctx, "voidlab-data-pool", &libvirt.PoolArgs{
				Name: pulumi.String(cfgSettings.dataPoolName),
				Type: pulumi.String("dir"),
				Target: &libvirt.PoolTargetArgs{
					Path: pulumi.String(cfgSettings.dataPoolPath),
				},
				Create: &libvirt.PoolCreateArgs{
					Autostart: pulumi.Bool(true),
					Build:     pulumi.Bool(true),
					Start:     pulumi.Bool(true),
				},
			}, pulumi.Provider(provider))
			if err != nil {
				return fmt.Errorf("create libvirt data storage pool: %w", err)
			}
		}

		reservations := libvirt.NetworkIpDhcpHostArray{}
		for _, vm := range cfgSettings.vms {
			reservations = append(reservations, &libvirt.NetworkIpDhcpHostArgs{
				Name: pulumi.String(vm.name),
				Mac:  pulumi.String(vm.mac),
				Ip:   pulumi.String(vm.ip),
			})
		}
		network, err := libvirt.NewNetwork(ctx, "voidlab-network", &libvirt.NetworkArgs{
			Name:      pulumi.String(cfgSettings.networkName),
			Autostart: pulumi.Bool(true),
			// Keep the libvirt bridge separate from the host's wg-voidlab interface.
			Bridge:  &libvirt.NetworkBridgeArgs{Name: pulumi.StringPtr("virbr-voidlab")},
			Forward: &libvirt.NetworkForwardArgs{Mode: pulumi.String("nat")},
			Dns:     &libvirt.NetworkDnsArgs{Enable: pulumi.String("yes")},
			Ips: libvirt.NetworkIpArray{
				&libvirt.NetworkIpArgs{
					Address: pulumi.String(cfgSettings.gateway),
					Prefix:  pulumi.Float64(float64(mustPrefixBits(cfgSettings.cidr))),
					Family:  pulumi.String("ipv4"),
					Dhcp: &libvirt.NetworkIpDhcpArgs{
						Hosts: reservations,
						Ranges: libvirt.NetworkIpDhcpRangeArray{
							&libvirt.NetworkIpDhcpRangeArgs{
								Start: pulumi.String(cfgSettings.dhcpStart),
								End:   pulumi.String(cfgSettings.dhcpEnd),
							},
						},
					},
				},
			},
		}, pulumi.Provider(provider))
		if err != nil {
			return fmt.Errorf("create libvirt NAT network: %w", err)
		}

		vmNames, vmIPs, vmIDs, sshCommands := pulumi.Map{}, pulumi.Map{}, pulumi.Map{}, pulumi.Map{}
		for _, vm := range cfgSettings.vms {
			_, _, domain, err := createVM(ctx, cfgSettings, vm, baseImage, pool, dataPool, network, provider)
			if err != nil {
				return err
			}
			vmNames[vm.name] = pulumi.String(vm.name)
			vmIPs[vm.name] = pulumi.String(vm.ip)
			vmIDs[vm.name] = domain.ID()
			keyPath := strings.TrimSuffix(cfgSettings.publicKeyPath, ".pub")
			sshCommands[vm.name] = pulumi.Sprintf("ssh -i %s %s@%s", keyPath, host.VMSSHUser, vm.ip)
		}

		ctx.Export("vmNames", vmNames)
		ctx.Export("vmIPs", vmIPs)
		ctx.Export("vmIDs", vmIDs)
		ctx.Export("sshCommands", sshCommands)
		ctx.Export("networkName", pulumi.String(cfgSettings.networkName))
		ctx.Export("vmSubnet", pulumi.String(cfgSettings.cidr))
		ctx.Export("hostName", pulumi.String(host.Name))
		// Named outputs let other stacks read the addresses declared in this host file.
		for _, vm := range cfgSettings.vms {
			outputKey := inventory.OutputKey(vm.name)
			ctx.Export("nodeIP_"+outputKey, pulumi.String(vm.ip))
		}
		ctx.Export("storagePoolName", pool.Name)
		return nil
	})
}

func createVM(ctx *pulumi.Context, cfg settings, vm vmSpec, baseImage *libvirt.Volume, pool, dataPool *libvirt.Pool, network *libvirt.Network, provider *libvirt.Provider) (*libvirt.Volume, *libvirt.Volume, *libvirt.Domain, error) {
	diskName := vm.name + ".qcow2"
	disk, err := libvirt.NewVolume(ctx, "disk-"+vm.name, &libvirt.VolumeArgs{
		Name:     pulumi.String(diskName),
		Pool:     pulumi.String(cfg.poolName),
		Capacity: pulumi.Float64(float64(vm.diskGiB) * bytesPerGiB),
		BackingStore: &libvirt.VolumeBackingStoreArgs{
			Path:   baseImage.Path,
			Format: &libvirt.VolumeBackingStoreFormatArgs{Type: pulumi.String("qcow2")},
		},
		Target: &libvirt.VolumeTargetArgs{
			Format: &libvirt.VolumeTargetFormatArgs{Type: pulumi.String("qcow2")},
		},
	}, pulumi.DependsOn([]pulumi.Resource{pool, baseImage}), pulumi.Provider(provider))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create %s disk: %w", vm.name, err)
	}

	metaData := fmt.Sprintf("instance-id: voidlab-%s\nlocal-hostname: %s\n", vm.name, vm.name)
	quotedKey, _ := json.Marshal(cfg.publicKey)
	userData := fmt.Sprintf(
		"#cloud-config\nhostname: %s\ntimezone: %s\nmanage_etc_hosts: true\nusers:\n  - name: void\n    gecos: VoidLab administrator\n    groups: [adm, sudo]\n    shell: /bin/bash\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    lock_passwd: true\n    ssh_authorized_keys:\n      - %s\nssh_pwauth: false\ndisable_root: true\n",
		vm.name, cfg.timezone, quotedKey,
	)
	cloudInit, err := libvirt.NewCloudinitDisk(ctx, "cloudinit-"+vm.name, &libvirt.CloudinitDiskArgs{
		Name:     pulumi.String("cloudinit-" + vm.name + ".iso"),
		MetaData: pulumi.String(metaData),
		UserData: pulumi.String(userData),
	}, pulumi.Provider(provider))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create %s cloud-init disk: %w", vm.name, err)
	}
	cloudInitVolume, err := libvirt.NewVolume(ctx, "cloudinit-volume-"+vm.name, &libvirt.VolumeArgs{
		Name: pulumi.String("cloudinit-" + vm.name + ".iso"),
		Pool: pulumi.String(cfg.poolName),
		Target: &libvirt.VolumeTargetArgs{
			Format: &libvirt.VolumeTargetFormatArgs{Type: pulumi.String("iso")},
		},
		Create: &libvirt.VolumeCreateArgs{
			Content: &libvirt.VolumeCreateContentArgs{Url: cloudInit.Path},
		},
	}, pulumi.DependsOn([]pulumi.Resource{pool, cloudInit}), pulumi.Provider(provider))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("upload %s cloud-init disk: %w", vm.name, err)
	}

	var dataDisk *libvirt.Volume
	if vm.dataDiskGiB > 0 {
		if dataPool == nil {
			return nil, nil, nil, fmt.Errorf("%s has a data disk configured but no data pool", vm.name)
		}
		dataDisk, err = libvirt.NewVolume(ctx, "data-disk-"+vm.name, &libvirt.VolumeArgs{
			Name:     pulumi.String("data-" + vm.name + ".qcow2"),
			Pool:     pulumi.String(cfg.dataPoolName),
			Capacity: pulumi.Float64(float64(vm.dataDiskGiB) * bytesPerGiB),
			Target: &libvirt.VolumeTargetArgs{
				Format: &libvirt.VolumeTargetFormatArgs{Type: pulumi.String("qcow2")},
			},
		}, pulumi.DependsOn([]pulumi.Resource{dataPool}), pulumi.Provider(provider))
		if err != nil {
			return nil, nil, nil, fmt.Errorf("create %s data disk: %w", vm.name, err)
		}
	}

	domainDisks := libvirt.DomainDevicesDiskArray{
		&libvirt.DomainDevicesDiskArgs{
			Device: pulumi.String("disk"),
			Driver: &libvirt.DomainDevicesDiskDriverArgs{Type: pulumi.String("qcow2")},
			Source: &libvirt.DomainDevicesDiskSourceArgs{
				Volume: &libvirt.DomainDevicesDiskSourceVolumeArgs{Pool: pulumi.String(cfg.poolName), Volume: pulumi.String(diskName)},
			},
			Target: &libvirt.DomainDevicesDiskTargetArgs{Dev: pulumi.String("vda"), Bus: pulumi.String("virtio")},
		},
		&libvirt.DomainDevicesDiskArgs{
			Device:   pulumi.String("cdrom"),
			ReadOnly: pulumi.Bool(true),
			Driver:   &libvirt.DomainDevicesDiskDriverArgs{Type: pulumi.String("raw")},
			Source: &libvirt.DomainDevicesDiskSourceArgs{
				Volume: &libvirt.DomainDevicesDiskSourceVolumeArgs{Pool: pulumi.String(cfg.poolName), Volume: cloudInitVolume.Name},
			},
			Target: &libvirt.DomainDevicesDiskTargetArgs{Dev: pulumi.String("sda"), Bus: pulumi.String("sata")},
		},
	}
	if dataDisk != nil {
		domainDisks = append(domainDisks, &libvirt.DomainDevicesDiskArgs{
			Device: pulumi.String("disk"),
			Driver: &libvirt.DomainDevicesDiskDriverArgs{Type: pulumi.String("qcow2")},
			Source: &libvirt.DomainDevicesDiskSourceArgs{
				Volume: &libvirt.DomainDevicesDiskSourceVolumeArgs{Pool: pulumi.String(cfg.dataPoolName), Volume: dataDisk.Name},
			},
			Target: &libvirt.DomainDevicesDiskTargetArgs{Dev: pulumi.String("vdb"), Bus: pulumi.String("virtio")},
		})
	}
	domainDependencies := []pulumi.Resource{pool, network, disk, cloudInitVolume}
	if dataDisk != nil {
		domainDependencies = append(domainDependencies, dataDisk)
	}

	domain, err := libvirt.NewDomain(ctx, "vm-"+vm.name, &libvirt.DomainArgs{
		Name:       pulumi.String(vm.name),
		Type:       pulumi.String("kvm"),
		Memory:     pulumi.Float64(float64(vm.memoryMiB)),
		MemoryUnit: pulumi.String("MiB"),
		Vcpu:       pulumi.Float64(float64(vm.vcpus)),
		Autostart:  pulumi.Bool(true),
		Running:    pulumi.Bool(true),
		Os: &libvirt.DomainOsArgs{
			Type:     pulumi.String("hvm"),
			TypeArch: pulumi.String("x86_64"),
			// No UEFI firmware or loader is set; libvirt uses its BIOS boot path.
		},
		Devices: &libvirt.DomainDevicesArgs{
			Disks: domainDisks,
			Interfaces: libvirt.DomainDevicesInterfaceArray{
				&libvirt.DomainDevicesInterfaceArgs{
					Mac:   &libvirt.DomainDevicesInterfaceMacArgs{Address: pulumi.String(vm.mac)},
					Model: &libvirt.DomainDevicesInterfaceModelArgs{Type: pulumi.String("virtio")},
					Source: &libvirt.DomainDevicesInterfaceSourceArgs{
						Network: &libvirt.DomainDevicesInterfaceSourceNetworkArgs{Network: pulumi.String(cfg.networkName)},
					},
				},
			},
		},
	}, pulumi.DependsOn(domainDependencies), pulumi.Provider(provider))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create %s VM: %w", vm.name, err)
	}
	return disk, cloudInitVolume, domain, nil
}

func makeVMSpec(node inventory.Node, index int) vmSpec {
	vcpus, memoryMiB, diskGiB := node.VCPUs, node.MemoryMiB, node.DiskGiB
	if node.Role == "control-plane" {
		if vcpus == 0 {
			vcpus = 2
		}
		if memoryMiB == 0 {
			memoryMiB = 3072
		}
		if diskGiB == 0 {
			diskGiB = 30
		}
	} else {
		if vcpus == 0 {
			vcpus = 2
		}
		if memoryMiB == 0 {
			memoryMiB = 4096
		}
		if diskGiB == 0 {
			diskGiB = 50
		}
	}
	mac := node.MAC
	if mac == "" {
		mac = fmt.Sprintf("52:54:00:20:00:%02x", 0x10+index)
	}
	return vmSpec{
		name:        node.Name,
		role:        node.Role,
		ip:          node.IP,
		mac:         mac,
		vcpus:       vcpus,
		memoryMiB:   memoryMiB,
		diskGiB:     diskGiB,
		dataDiskGiB: node.DataDiskGiB,
	}
}

func libvirtURI(host inventory.Host) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("locate home directory for libvirt SSH settings: %w", err)
	}
	query := url.Values{}
	query.Set("keyfile", host.SSHPrivateKeyPath)
	query.Set("knownhosts", filepath.Join(home, ".ssh", "known_hosts"))
	target := host.Address
	proxy := "native"
	if host.SSHAlias != "" {
		target = host.SSHAlias
		proxy = "auto"
	}
	query.Set("proxy", proxy)
	uri := url.URL{
		Scheme:   "qemu+sshcmd",
		User:     url.User(host.SSHUser),
		Host:     target,
		Path:     "/system",
		RawQuery: query.Encode(),
	}
	return uri.String(), nil
}

func mustPrefixBits(cidr string) int {
	prefix, _ := netip.ParsePrefix(cidr)
	return prefix.Bits()
}

func validateSettings(cfg settings) error {
	if len(cfg.vms) == 0 {
		return fmt.Errorf("at least one VM must be configured")
	}
	prefix, err := netip.ParsePrefix(cfg.cidr)
	if err != nil || !prefix.Addr().Is4() {
		return fmt.Errorf("networkCIDR %q must be a valid IPv4 prefix", cfg.cidr)
	}
	gateway, err := netip.ParseAddr(cfg.gateway)
	if err != nil || !gateway.Is4() || !prefix.Contains(gateway) {
		return fmt.Errorf("gateway %q must be an IPv4 address inside %s", cfg.gateway, cfg.cidr)
	}
	start, err := netip.ParseAddr(cfg.dhcpStart)
	if err != nil || !start.Is4() || !prefix.Contains(start) {
		return fmt.Errorf("DHCP range start %q must be inside %s", cfg.dhcpStart, cfg.cidr)
	}
	end, err := netip.ParseAddr(cfg.dhcpEnd)
	if err != nil || !end.Is4() || !prefix.Contains(end) || end.Less(start) {
		return fmt.Errorf("DHCP range end %q must be at or after the start and inside %s", cfg.dhcpEnd, cfg.cidr)
	}
	if !strings.HasPrefix(cfg.poolPath, "/") {
		return fmt.Errorf("poolPath %q must be an absolute host path", cfg.poolPath)
	}
	for _, vm := range cfg.vms {
		if vm.dataDiskGiB > 0 && !strings.HasPrefix(cfg.dataPoolPath, "/") {
			return fmt.Errorf("dataPoolPath %q must be an absolute host path when %s has a data disk", cfg.dataPoolPath, vm.name)
		}
	}
	seenIPs := map[netip.Addr]string{}
	seenMACs := map[string]string{}
	for _, vm := range cfg.vms {
		address, err := netip.ParseAddr(vm.ip)
		if err != nil || !address.Is4() || !prefix.Contains(address) || address == gateway {
			return fmt.Errorf("reserved IP %q for %s must be an IPv4 address in %s and differ from the gateway", vm.ip, vm.name, cfg.cidr)
		}
		if prior, exists := seenIPs[address]; exists {
			return fmt.Errorf("reserved IP %q is assigned to both %s and %s", address, prior, vm.name)
		}
		seenIPs[address] = vm.name
		if !address.Less(start) && !end.Less(address) {
			return fmt.Errorf("reserved IP %q for %s must remain outside the DHCP dynamic range", vm.ip, vm.name)
		}
		mac := strings.ToLower(vm.mac)
		if prior, exists := seenMACs[mac]; exists {
			return fmt.Errorf("MAC address %q is assigned to both %s and %s", vm.mac, prior, vm.name)
		}
		seenMACs[mac] = vm.name
		if vm.vcpus < 1 || vm.memoryMiB < 1 || vm.diskGiB < 1 || vm.dataDiskGiB < 0 {
			return fmt.Errorf("CPU, memory, and system disk settings for %s must be positive, and data disk size must not be negative", vm.name)
		}
	}
	if cfg.imageURL == "" || cfg.timezone == "" || cfg.publicKey == "" {
		return fmt.Errorf("ubuntuImageURL, timezone, and SSH public key must be configured")
	}
	return nil
}
