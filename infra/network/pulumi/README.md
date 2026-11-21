# VoidLab direct server networking

This Pulumi project applies peer-specific firewall rules on the two physical Fedora servers. It has no VM, libvirt, WireGuard, or overlay network logic. The servers use direct LAN addresses `192.168.29.81` and `192.168.29.52`; Kubernetes bootstrap opens the control-plane and kubelet ports it needs before kubeadm joins the worker.

## Configuration

The stack config mirrors the node names, roles, addresses, SSH users, and key paths in `infra/kubernetes/pulumi/Pulumi.k8.yaml`. `sshAddress` is optional and defaults to the node IP.

Apply after Kubernetes and before Cilium:

```bash
pulumi preview --stack snharish85-gmail-com-org/voidlab-network/network
pulumi up --stack snharish85-gmail-com-org/voidlab-network/network
```

When firewalld or UFW is active, the stack allows traffic from the other server on TCP ports 6443 and 10250, plus UDP 8472 for Cilium VXLAN. It verifies the direct route and the peer's Kubernetes listener. The two servers are on the same LAN, so no cloud firewall or overlay is involved.
