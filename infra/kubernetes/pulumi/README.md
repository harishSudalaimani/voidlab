# VoidLab Kubernetes bootstrap

This Pulumi project installs Kubernetes directly on the two physical Fedora 45 servers. `cp` (192.168.29.81, 8 CPUs/29 GiB RAM) is the control plane; `worker` (192.168.29.52, 4 CPUs/17 GiB RAM) is the application worker. Pulumi connects using the existing `dark` and `void` SSH accounts and keys, sets persistent hostnames to `cp` and `worker`, then uses kubeadm to initialize and join the cluster. Kubernetes reports each machine's CPU and memory capacity directly; this project adds no node-wide CPU or RAM limits. On `cp`, containerd image data is stored on the `/data/vms` SSD instead of the 15 GiB root filesystem.

## Required server configuration

The current addresses, usernames, roles, and local key paths are configured in `Pulumi.k8.yaml`. Both servers are on `192.168.29.0/24`, so SSH and Kubernetes node traffic use their direct LAN addresses. Reserve these DHCP addresses in the router so the stack's node IPs remain stable. Both machines must accept key-based SSH with passwordless `sudo`.

The stack config already has these values:

| Node | Role | Node IP | SSH login | Key |
|---|---|---|---|---|
| `cp` | control plane | `192.168.29.81` | `dark` | `~/.ssh/dark` |
| `worker` | worker | `192.168.29.52` | `void` | `~/.ssh/voidlab` |

Both server host keys and local SSH keys were found in `~/.ssh`. The servers must stay on Fedora 45 and be able to reach one another on the LAN. The preflight sets their static hostnames, switches SELinux to permissive mode as required by kubeadm's Fedora instructions, and opens TCP/6443 and TCP/10250 between the peer addresses before bootstrap. Reserve these DHCP addresses in the router so the stack's node IPs remain stable.

## Apply order

Apply these stacks in order: Kubernetes, network, Cilium, then Argo CD. Kubernetes installs containerd and kubeadm, initializes the control plane, joins the worker, waits for both nodes to register, and exports a local-tunnel kubeconfig. Nodes remain `NotReady` until Cilium is installed.

```bash
pulumi preview --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
pulumi up --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
```

Then apply `infra/network/pulumi`, followed by `infra/cilium/pulumi`, then `infra/argocd/pulumi`. The network stack opens peer-specific TCP/6443, TCP/10250, and UDP/8472 in firewalld (or UFW) when active, and checks the direct path. It does not create an overlay or replace the servers' existing routes. Kubernetes' default control-plane taint keeps ordinary application pods on `worker`; Cilium and other required DaemonSets still run on both nodes.

## Connect kubectl

After Kubernetes completes, save its secret kubeconfig output locally:

```bash
umask 077
mkdir -p "$HOME/.kube"
pulumi stack output kubeconfigBase64 --stack snharish85-gmail-com-org/voidlab-kubernetes/k8 --show-secrets | base64 -D > "$HOME/.kube/voidlab"
pulumi stack output sshTunnel --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
```

Run the printed SSH tunnel command in one terminal. In another terminal, keep `KUBECONFIG` set while applying Cilium and Argo CD:

```bash
export KUBECONFIG="$HOME/.kube/voidlab"
kubectl get nodes -o wide
```

## Reruns

Remote commands do not undo packages or kubeadm state when their Pulumi resources are removed. `joinTokenGeneration` is a deliberate rerun trigger for the bootstrap commands; increment it only when a worker join needs a fresh token. The Kubernetes stack owns cluster bootstrap; the network stack manages peer firewall rules; Cilium owns the CNI; Argo CD owns GitOps bootstrap.
