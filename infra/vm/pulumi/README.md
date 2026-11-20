# VoidLab virtual machines

This Pulumi project creates the libvirt networks, storage pools, and Ubuntu VMs for one hypervisor at a time. Each host has its own Pulumi stack and its own file named `Pulumi.<host>.yaml`.

The VM NAT network uses the host bridge `virbr-voidlab`. WireGuard uses its separate interface, `wg-voidlab`; keeping those names separate avoids a host network collision.

`Pulumi.host1.yaml` now describes server2 (`192.168.29.81`): the control plane and two workers. The control plane has 2 vCPUs, 4 GiB RAM, and a 30 GiB system disk. Each worker has 2 vCPUs, 12 GiB RAM, a 100 GiB system disk, and an 800 GiB data disk.

`Pulumi.host2.yaml` describes server1 (`192.168.29.52`): two workers, each with 2 vCPUs, 7 GiB RAM, and a 100 GiB system disk. These workers have no data disks. The Go program reads the `voidlab-vm:host` object from the selected stack file; VM names, IPs, roles, and sizes come from that object.

## Clean rebuild of the existing host stacks

The existing `host1` and `host2` Pulumi states were created with the opposite server assignments. Changing a stack file does not move its VMs or transfer its state. For this clean rebuild, restore the old layout first: host1 on server1 (`192.168.29.52`) with `cp`, `worker-1`, and `worker-2`; host2 on server2 (`192.168.29.81`) with `worker-3`, `worker-4`, and `worker-5`.

Preview and destroy the old stacks one at a time while their files point to the original servers. This removes the old VMs, system disks, and server2's existing 600 GiB data disks. Confirm each preview before destroying:

```bash
pulumi destroy --preview-only --stack snharish85-gmail-com-org/voidlab-vm/host1
pulumi destroy --stack snharish85-gmail-com-org/voidlab-vm/host1
pulumi destroy --preview-only --stack snharish85-gmail-com-org/voidlab-vm/host2
pulumi destroy --stack snharish85-gmail-com-org/voidlab-vm/host2
```

After both old stacks are empty, restore the desired host files (`host1` on server2 and `host2` on server1), preview them, then run `pulumi up`. A failed host1 update can leave created resources such as the provider, storage pools, and cloud-init disks in its Pulumi state even when no VM domains were created. Inspect the preview before the next update. Destroying an empty VM stack also does not remove the WireGuard interface managed by the separate network project.

## Add a host

Create `Pulumi.host3.yaml` in this directory. Copy the shape of an existing file and update:

- `address`, `sshUser`, and `sshPrivateKeyPath` for SSH access to the hypervisor.
- `sshPublicKeyPath`, `vmSSHUser`, and `vmSSHPrivateKeyPath` for SSH access to the VMs.
- `networkCIDR`, `gateway`, and DHCP range for a subnet that does not overlap any other host.
- `tunnelAddress` with a free address inside `wireGuardCIDR` in the network project's config.
- `poolName` and `poolPath` for storage on that server.
- `nodes` with one or more VMs. Every node needs a unique `name`, reserved `ip`, and `role` (`control-plane` or `worker`). CPU, memory, and disk sizes are optional; the program supplies simple defaults. `dataDiskGiB` is optional.

The libvirt connection is built from the host address, SSH username, and SSH key path. You do not need a separate `libvirt:uri` setting. Make the SSH private-key file available at the configured path, and connect to the host once so its SSH host key is in `~/.ssh/known_hosts`.

Create the Pulumi stack with the same name as the file suffix, then update it:

```bash
pulumi stack init snharish85-gmail-com-org/voidlab-vm/host3
pulumi preview --stack snharish85-gmail-com-org/voidlab-vm/host3
pulumi up --stack snharish85-gmail-com-org/voidlab-vm/host3
```

After the VM stack succeeds, the network and Kubernetes projects discover host3 automatically from `Pulumi.host3.yaml`. Run those projects after updating this VM stack.

## Outputs

Each stack exports the host subnet and network name, maps of VM names and addresses, and named `nodeIP_<name>` outputs. The network project reads those named outputs through Pulumi StackReferences.

Do not remove or rename a host file while another stack still needs its VM inventory. Removing a node or host is a real infrastructure change; review the VM, network, and Kubernetes stack previews before applying it.
