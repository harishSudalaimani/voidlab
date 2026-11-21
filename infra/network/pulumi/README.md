# VoidLab direct server networking

This Pulumi project applies peer-specific firewall rules on the two physical Fedora servers. It has no VM, libvirt, WireGuard, or overlay network logic. The servers use direct LAN addresses `192.168.29.81` and `192.168.29.52`; Kubernetes bootstrap opens the control-plane and kubelet ports it needs before kubeadm joins the worker.

## Configuration

The stack config mirrors the node names, roles, addresses, SSH users, and key paths in `infra/kubernetes/pulumi/Pulumi.k8.yaml`. `sshAddress` is optional and defaults to the node IP.

Apply after Kubernetes and before Cilium:

```bash
pulumi preview --stack snharish85-gmail-com-org/voidlab-network/network
pulumi up --stack snharish85-gmail-com-org/voidlab-network/network
```

When firewalld or UFW is active, the stack applies this cluster network baseline:

| Traffic | Allowed path | Purpose |
| --- | --- | --- |
| TCP 6443 | Peer server to control plane | Kubernetes API |
| TCP 10250 | Between peer servers | Kubelet |
| TCP 4240 | Between peer servers | Cilium health checks |
| UDP 8472 | Between peer servers | Cilium VXLAN |
| TCP 4244 | Peer server and Kubernetes Pod CIDR to each node | Hubble server and Relay |

The Pod CIDR comes from the Kubernetes stack. Cilium's TCP health check port is included so `cilium-health` can report node connectivity; the network also verifies the direct route and peer Kubernetes listener. Argo CD uses in-cluster services and adds no node-to-node firewall port. Future components that require host-network listeners or direct node-to-node connections must add their documented ports here before deployment; ClusterIP-only components need no host firewall port.
