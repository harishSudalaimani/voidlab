package main

import (
	"encoding/json"
	"fmt"
	"net/netip"
	"os"
	"strconv"
	"strings"

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
	ipConfigKey string
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
		publicKeyPath := configString(cfg, "sshPublicKeyPath", "/home/harish/.ssh/id_ed25519_voidlab.pub")
		keyBytes, err := os.ReadFile(publicKeyPath)
		if err != nil {
			return fmt.Errorf("read SSH public key %q: %w", publicKeyPath, err)
		}
		publicKey := strings.TrimSpace(string(keyBytes))
		if publicKey == "" || (!strings.HasPrefix(publicKey, "ssh-") && !strings.HasPrefix(publicKey, "ecdsa-")) {
			return fmt.Errorf("%q does not contain an OpenSSH public key", publicKeyPath)
		}

		controlPlaneCount := configInt(cfg, "controlPlaneCount", 1)
		workerCount := configInt(cfg, "workerCount", 3)
		workerIndexOffset := configInt(cfg, "workerIndexOffset", 0)
		if controlPlaneCount < 0 || controlPlaneCount > 1 {
			return fmt.Errorf("controlPlaneCount must be 0 or 1")
		}
		if workerCount < 0 {
			return fmt.Errorf("workerCount must not be negative")
		}
		if workerIndexOffset < 0 {
			return fmt.Errorf("workerIndexOffset must not be negative")
		}
		cpVCPU := configInt(cfg, "cpVCPU", 1)
		workerVCPU := configInt(cfg, "workerVCPU", 1)
		cpMemory := configInt(cfg, "cpMemoryMiB", 2048)
		workerMemory := configInt(cfg, "workerMemoryMiB", 4096)
		cpDisk := configInt(cfg, "cpDiskGiB", 20)
		workerDisk := configInt(cfg, "workerDiskGiB", 50)
		vmDataDisk := configInt(cfg, "vmDataDiskGiB", 0)
		vms := make([]vmSpec, 0, controlPlaneCount+workerCount)
		if controlPlaneCount == 1 {
			vms = append(vms, vmSpec{name: "cp", role: "Kubernetes control plane", ipConfigKey: "cpIP", mac: "52:54:00:20:00:10", vcpus: cpVCPU, memoryMiB: cpMemory, diskGiB: cpDisk, dataDiskGiB: vmDataDisk})
		}
		for i := 1; i <= workerCount; i++ {
			workerNumber := i + workerIndexOffset
			vms = append(vms, vmSpec{
				name:        fmt.Sprintf("worker-%d", workerNumber),
				role:        "Kubernetes worker",
				ipConfigKey: fmt.Sprintf("worker%dIP", i),
				mac:         fmt.Sprintf("52:54:00:20:00:%02x", 0x10+i),
				vcpus:       workerVCPU,
				memoryMiB:   workerMemory,
				diskGiB:     workerDisk,
				dataDiskGiB: vmDataDisk,
			})
		}
		cfgSettings := settings{
			networkName:   configString(cfg, "networkName", "voidlab-network"),
			cidr:          configString(cfg, "networkCIDR", "10.20.0.0/24"),
			gateway:       configString(cfg, "gateway", "10.20.0.1"),
			dhcpStart:     configString(cfg, "dhcpRangeStart", "10.20.0.100"),
			dhcpEnd:       configString(cfg, "dhcpRangeEnd", "10.20.0.254"),
			poolName:      configString(cfg, "poolName", "voidlab-pool"),
			poolPath:      configString(cfg, "poolPath", "/var/lib/libvirt/images/voidlab"),
			dataPoolName:  configString(cfg, "dataPoolName", "voidlab-data-pool"),
			dataPoolPath:  configString(cfg, "dataPoolPath", ""),
			imageURL:      configString(cfg, "ubuntuImageURL", defaultImageURL),
			publicKey:     publicKey,
			publicKeyPath: publicKeyPath,
			timezone:      configString(cfg, "timezone", "Asia/Kolkata"),
			vms:           vms,
		}
		for i := range cfgSettings.vms {
			key := cfgSettings.vms[i].ipConfigKey
			cfgSettings.vms[i].ipConfigKey = configString(cfg, key, defaultVMIP(cfgSettings.vms[i].name, cfgSettings.cidr))
		}
		if err := validateSettings(cfgSettings); err != nil {
			return err
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
		})
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
		}, pulumi.DependsOn([]pulumi.Resource{pool}))
		if err != nil {
			return fmt.Errorf("create Ubuntu base image volume: %w", err)
		}

		var dataPool *libvirt.Pool
		if vmDataDisk > 0 {
			if cfgSettings.dataPoolPath == "" {
				return fmt.Errorf("dataPoolPath must be configured when vmDataDiskGiB is positive")
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
			})
			if err != nil {
				return fmt.Errorf("create libvirt data storage pool: %w", err)
			}
		}

		reservations := libvirt.NetworkIpDhcpHostArray{}
		for _, vm := range cfgSettings.vms {
			reservations = append(reservations, &libvirt.NetworkIpDhcpHostArgs{
				Name: pulumi.String(vm.name),
				Mac:  pulumi.String(vm.mac),
				Ip:   pulumi.String(vm.ipConfigKey),
			})
		}
		network, err := libvirt.NewNetwork(ctx, "voidlab-network", &libvirt.NetworkArgs{
			Name:      pulumi.String(cfgSettings.networkName),
			Autostart: pulumi.Bool(true),
			Forward:   &libvirt.NetworkForwardArgs{Mode: pulumi.String("nat")},
			Dns:       &libvirt.NetworkDnsArgs{Enable: pulumi.String("yes")},
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
		})
		if err != nil {
			return fmt.Errorf("create libvirt NAT network: %w", err)
		}

		vmNames, vmIPs, vmIDs, sshCommands := pulumi.Map{}, pulumi.Map{}, pulumi.Map{}, pulumi.Map{}
		for _, vm := range cfgSettings.vms {
			_, _, domain, err := createVM(ctx, cfgSettings, vm, baseImage, pool, dataPool, network)
			if err != nil {
				return err
			}
			vmNames[vm.name] = pulumi.String(vm.name)
			vmIPs[vm.name] = pulumi.String(vm.ipConfigKey)
			vmIDs[vm.name] = domain.ID()
			keyPath := strings.TrimSuffix(cfgSettings.publicKeyPath, ".pub")
			sshCommands[vm.name] = pulumi.Sprintf("ssh -i %s void@%s", keyPath, vm.ipConfigKey)
		}

		ctx.Export("vmNames", vmNames)
		ctx.Export("vmIPs", vmIPs)
		ctx.Export("vmIDs", vmIDs)
		ctx.Export("sshCommands", sshCommands)
		ctx.Export("networkName", pulumi.String(cfgSettings.networkName))
		ctx.Export("storagePoolName", pool.Name)
		return nil
	})
}

func createVM(ctx *pulumi.Context, cfg settings, vm vmSpec, baseImage *libvirt.Volume, pool, dataPool *libvirt.Pool, network *libvirt.Network) (*libvirt.Volume, *libvirt.Volume, *libvirt.Domain, error) {
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
	}, pulumi.DependsOn([]pulumi.Resource{pool, baseImage}))
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
	})
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
	}, pulumi.DependsOn([]pulumi.Resource{pool, cloudInit}))
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
		}, pulumi.DependsOn([]pulumi.Resource{dataPool}))
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
	}, pulumi.DependsOn(domainDependencies))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create %s VM: %w", vm.name, err)
	}
	return disk, cloudInitVolume, domain, nil
}

func configString(cfg *config.Config, key, fallback string) string {
	if value := cfg.Get(key); value != "" {
		return value
	}
	return fallback
}

func configInt(cfg *config.Config, key string, fallback int) int {
	if value := cfg.Get(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return fallback
}

func defaultVMIP(name, cidr string) string {
	prefix, err := netip.ParsePrefix(cidr)
	if err != nil || !prefix.Addr().Is4() {
		return "10.20.0.13"
	}
	hostOffset := 10
	if name != "cp" {
		var workerNumber int
		if _, err := fmt.Sscanf(name, "worker-%d", &workerNumber); err != nil || workerNumber < 1 || workerNumber >= 245 {
			return "10.20.0.13"
		}
		hostOffset += workerNumber
	}
	address := prefix.Masked().Addr()
	for i := 0; i < hostOffset; i++ {
		address = address.Next()
	}
	return address.String()
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
	seenIPs := map[netip.Addr]string{}
	seenMACs := map[string]string{}
	for _, vm := range cfg.vms {
		address, err := netip.ParseAddr(vm.ipConfigKey)
		if err != nil || !address.Is4() || !prefix.Contains(address) || address == gateway {
			return fmt.Errorf("reserved IP %q for %s must be an IPv4 address in %s and differ from the gateway", vm.ipConfigKey, vm.name, cfg.cidr)
		}
		if prior, exists := seenIPs[address]; exists {
			return fmt.Errorf("reserved IP %q is assigned to both %s and %s", address, prior, vm.name)
		}
		seenIPs[address] = vm.name
		if !address.Less(start) && !end.Less(address) {
			return fmt.Errorf("reserved IP %q for %s must remain outside the DHCP dynamic range", vm.ipConfigKey, vm.name)
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
