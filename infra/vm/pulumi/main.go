package main

import (
	"encoding/json"
	"fmt"
	"net/netip"
	"os"
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
}

type settings struct {
	networkName   string
	cidr          string
	gateway       string
	dhcpStart     string
	dhcpEnd       string
	poolName      string
	poolPath      string
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

		cpVCPU := configInt(cfg, "cpVCPU", 1)
		workerVCPU := configInt(cfg, "workerVCPU", 1)
		cpMemory := configInt(cfg, "cpMemoryMiB", 2048)
		workerMemory := configInt(cfg, "workerMemoryMiB", 4096)
		cpDisk := configInt(cfg, "cpDiskGiB", 20)
		workerDisk := configInt(cfg, "workerDiskGiB", 50)
		cfgSettings := settings{
			networkName:   configString(cfg, "networkName", "voidlab-network"),
			cidr:          configString(cfg, "networkCIDR", "10.20.0.0/24"),
			gateway:       configString(cfg, "gateway", "10.20.0.1"),
			dhcpStart:     configString(cfg, "dhcpRangeStart", "10.20.0.100"),
			dhcpEnd:       configString(cfg, "dhcpRangeEnd", "10.20.0.254"),
			poolName:      configString(cfg, "poolName", "voidlab-pool"),
			poolPath:      configString(cfg, "poolPath", "/var/lib/libvirt/images/voidlab"),
			imageURL:      configString(cfg, "ubuntuImageURL", defaultImageURL),
			publicKey:     publicKey,
			publicKeyPath: publicKeyPath,
			timezone:      configString(cfg, "timezone", "Asia/Kolkata"),
			vms: []vmSpec{
				{name: "cp", role: "Kubernetes control plane", ipConfigKey: "cpIP", mac: "52:54:00:20:00:10", vcpus: cpVCPU, memoryMiB: cpMemory, diskGiB: cpDisk},
				{name: "worker-1", role: "Kubernetes worker", ipConfigKey: "worker1IP", mac: "52:54:00:20:00:11", vcpus: workerVCPU, memoryMiB: workerMemory, diskGiB: workerDisk},
				{name: "worker-2", role: "Kubernetes worker", ipConfigKey: "worker2IP", mac: "52:54:00:20:00:12", vcpus: workerVCPU, memoryMiB: workerMemory, diskGiB: workerDisk},
				{name: "worker-3", role: "Kubernetes worker", ipConfigKey: "worker3IP", mac: "52:54:00:20:00:13", vcpus: workerVCPU, memoryMiB: workerMemory, diskGiB: workerDisk},
			},
		}
		for i := range cfgSettings.vms {
			key := cfgSettings.vms[i].ipConfigKey
			cfgSettings.vms[i].ipConfigKey = configString(cfg, key, defaultVMIP(cfgSettings.vms[i].name))
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
			_, _, domain, err := createVM(ctx, cfgSettings, vm, baseImage, pool, network)
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

func createVM(ctx *pulumi.Context, cfg settings, vm vmSpec, baseImage *libvirt.Volume, pool *libvirt.Pool, network *libvirt.Network) (*libvirt.Volume, *libvirt.Volume, *libvirt.Domain, error) {
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
			Format: &libvirt.VolumeTargetFormatArgs{Type: pulumi.String("raw")},
		},
		Create: &libvirt.VolumeCreateArgs{
			Content: &libvirt.VolumeCreateContentArgs{Url: cloudInit.Path},
		},
	}, pulumi.DependsOn([]pulumi.Resource{pool, cloudInit}))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("upload %s cloud-init disk: %w", vm.name, err)
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
			Disks: libvirt.DomainDevicesDiskArray{
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
			},
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
	}, pulumi.DependsOn([]pulumi.Resource{pool, network, disk, cloudInitVolume}))
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
	if value := cfg.GetInt(key); value != 0 {
		return value
	}
	return fallback
}

func defaultVMIP(name string) string {
	switch name {
	case "cp":
		return "10.20.0.10"
	case "worker-1":
		return "10.20.0.11"
	case "worker-2":
		return "10.20.0.12"
	default:
		return "10.20.0.13"
	}
}

func mustPrefixBits(cidr string) int {
	prefix, _ := netip.ParsePrefix(cidr)
	return prefix.Bits()
}

func validateSettings(cfg settings) error {
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
		address, err := netip.ParseAddr(vm.ipConfigKey)
		if err != nil || !address.Is4() || !prefix.Contains(address) || address == gateway {
			return fmt.Errorf("reserved IP %q for %s must be an IPv4 address in %s and differ from the gateway", vm.ipConfigKey, vm.name, cfg.cidr)
		}
		if !address.Less(start) && !end.Less(address) {
			return fmt.Errorf("reserved IP %q for %s must remain outside the DHCP dynamic range", vm.ipConfigKey, vm.name)
		}
		if vm.vcpus < 1 || vm.memoryMiB < 1 || vm.diskGiB < 1 {
			return fmt.Errorf("CPU, memory, and disk settings for %s must be positive", vm.name)
		}
	}
	if cfg.imageURL == "" || cfg.timezone == "" || cfg.publicKey == "" {
		return fmt.Errorf("ubuntuImageURL, timezone, and SSH public key must be configured")
	}
	return nil
}
