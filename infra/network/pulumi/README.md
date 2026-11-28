# VoidLab direct server networking

This Pulumi project applies the single-node Kubernetes host firewall rules to `cp` (`192.168.29.81`). It has no VM, libvirt, WireGuard, or overlay network logic. Cilium, the Kubernetes API, Gateway, and DNS pods all run on this server.

## Configuration

The stack config mirrors the control-plane name, role, address, SSH user, and key path in `infra/kubernetes/pulumi/Pulumi.k8.yaml`. Set `voidlab-network:lanCIDR` to the trusted home LAN prefix; the node address must be inside it. `sshAddress` is optional and defaults to the node IP.

Apply after Kubernetes and before Cilium:

```bash
pulumi preview --stack snharish85-gmail-com-org/voidlab-network/network
pulumi up --stack snharish85-gmail-com-org/voidlab-network/network
```

When firewalld or UFW is active, the stack applies this cluster network baseline:

| Traffic | Allowed path | Purpose |
| --- | --- | --- |
| TCP 6443 | Kubernetes Pod CIDR to control-plane host | Kubernetes API, including in-cluster API clients |
| TCP 4244 | Kubernetes Pod CIDR to control-plane host | Hubble server and Relay |
| TCP 80, 443 | LAN CIDR through control plane to Pod CIDR | Istio Gateway from trusted home LAN clients |
| TCP/UDP 53 | LAN CIDR through control plane to Pod CIDR | Technitium DNS at its Cilium L2 VIP |

The Pod CIDR comes from the Kubernetes stack. Gateway and DNS ports are source-restricted to `lanCIDR` and forwarded to the Pod CIDR through `cp`, where the Gateway and Technitium pods run and their L2-announced VIPs are placed. The firewalld policy and UFW routed rules permit TCP 80/443 and TCP/UDP 53 from the configured LAN CIDR to the Pod CIDR. Old host-input rules and broad node port openings for 80/443 are removed. The NodePort range is not opened. WAN clients will not pass this host firewall rule unless the router rewrites their source addresses into the LAN CIDR. Cloudflare Tunnel reaches the Gateway through the in-cluster Service and uses outbound connections, so it does not require opening Gateway ports to WAN. Argo CD uses in-cluster services and adds no node-to-node firewall port. Future components that require host-network listeners need their documented ports added here before deployment.
