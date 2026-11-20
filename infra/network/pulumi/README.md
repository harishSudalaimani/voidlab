# VoidLab network

This project joins the private VM networks with WireGuard. It sits between VM creation and Kubernetes:

1. Each `infra/vm/pulumi` host stack creates its VMs.
2. `infra/network/pulumi` connects every host and checks that every VM can reach every other VM over SSH.
3. `infra/kubernetes/pulumi` bootstraps Kubernetes on the nodes declared with `role: control-plane` or `role: worker`.
4. `infra/cilium/pulumi` installs Cilium and Hubble Relay.

## Where the settings live

`infra/vm/pulumi/Pulumi.host*.yaml` is the shared host and node inventory. The network project discovers every file matching that pattern. For each host it reads the VM subnet and named node IPs from that host's VM stack; it does not keep a second IP list.

The network stack owns WireGuard, hypervisor forwarding/firewall rules, the libvirt forwarding hook, and the TCP/22 reachability check. Kubernetes consumes the network stack's named node IP outputs and `routingVerified` result. It stops before bootstrapping if routing has not passed.

Host1 is the WireGuard hub and now points to server2, the better server. Host2 points to server1. Other hosts are spokes. Give each host a unique `tunnelAddress` inside `wireGuardCIDR` in `Pulumi.network.yaml`. Keep the VM subnets and WireGuard subnet separate. The hub-and-spoke arrangement expects a file named `Pulumi.host1.yaml`.

## Host requirements

Each hypervisor must have libvirt and a working SSH account with passwordless `sudo`. Network setup installs WireGuard tools (using `dnf` or `apt`) and requires active `firewalld`, `nft`, `virsh`, and `ssh-keyscan`. Start firewalld yourself after confirming it permits SSH. The network update opens UDP/51820 and adds specific rules for the configured VM subnets.

Before the first update, SSH to each host once so its verified host key is recorded in your local `~/.ssh/known_hosts`. Set each host's SSH private-key path and the VM SSH-key paths in its host file. Private key contents are read locally and sent to Pulumi remote commands as secrets.

## Run order

Run the stacks manually in this order. Use the stack names already used in your Pulumi Cloud organization. First update each VM stack so its outputs exist; then update this network stack; then Kubernetes; then Cilium and Argo CD.

```bash
cd infra/vm/pulumi
pulumi up --stack snharish85-gmail-com-org/voidlab-vm/host1
pulumi up --stack snharish85-gmail-com-org/voidlab-vm/host2

cd ../../network/pulumi
pulumi preview --stack snharish85-gmail-com-org/voidlab-network/network
pulumi up --stack snharish85-gmail-com-org/voidlab-network/network
```

The network update exports `nodeIPs`, `nodeRoles`, named `nodeIP_*` values, `controlPlaneIP`, and `routingVerified`. The update finishes only when each declared VM has its expected address and can reach all other declared VMs on TCP/22.

## Add another hypervisor

1. Add `infra/vm/pulumi/Pulumi.host3.yaml` using the same fields as the existing host files. Give it a unique VM subnet and WireGuard address, and list each VM with its name, IP, and Kubernetes role.
2. Create the Pulumi VM stack named `host3` and run its VM update. Its provider connection is built from the address, SSH username, and key path in the host file.
3. Run this network stack. It discovers host3, reads its VM stack outputs, adds it as a WireGuard spoke, and verifies its nodes with the existing hosts.
4. Run Kubernetes so it sees any new nodes and their declared roles.

No Go source changes are needed to add hosts or nodes. Keep the host files present while updating or destroying the network stack, because they are its inventory.

## Persistent host settings

Remote commands configure services and firewall rules on the hypervisors; destroying this Pulumi stack does not reverse those host changes. The libvirt hook installer saves an existing `/etc/libvirt/hooks/network` as `/etc/libvirt/hooks/network.voidlab-original` before installing the VoidLab hook. Keep the network stack and inventory files while the Kubernetes cluster uses the routed networks.

If a routing check fails, check the WireGuard handshake on each host, then inspect firewalld policies, the libvirt nftables rules, and whether each VM accepts SSH. The failure occurs before the Kubernetes stack starts.
