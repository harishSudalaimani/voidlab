# VoidLab Kubernetes bootstrap

This Pulumi project installs Kubernetes on the single physical Fedora 45 server `cp` (`192.168.29.81`, 8 CPUs/29 GiB RAM). Pulumi connects using the existing `dark` SSH account and key, sets the persistent hostname to `cp`, and uses kubeadm to initialize a single-node cluster. Kubernetes reports the machine's CPU and memory capacity directly; this project adds no node-wide CPU or RAM limits. Containerd image data is stored on the `/data/vms` SSD instead of the 15 GiB root filesystem. Bootstrap removes the control-plane `NoSchedule` taint so application pods can run on this only node.

## Required server configuration

The address, username, role, and local key path are configured in `Pulumi.k8.yaml`. Reserve `192.168.29.81` in the router so the control-plane address stays stable. The server must accept key-based SSH with passwordless `sudo`.

The stack config already has these values:

| Node | Role | Node IP | SSH login | Key |
|---|---|---|---|---|
| `cp` | control plane | `192.168.29.81` | `dark` | `~/.ssh/dark` |

The server host key and local SSH key are expected in `~/.ssh`. Keep the machine on Fedora 45. The preflight sets its static hostname, switches SELinux to permissive mode as required by kubeadm's Fedora instructions, and checks the `/data/vms` and `/storage` Longhorn mounts.

## Apply order

Apply these stacks in order: Kubernetes, network, Cilium, then Argo CD. Kubernetes installs containerd and kubeadm, initializes the control plane, makes `cp` schedulable, waits for it to register, and exports a local-tunnel kubeconfig. The node remains `NotReady` until Cilium is installed.

```bash
pulumi preview --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
pulumi up --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
```

Then apply `infra/network/pulumi`, followed by `infra/cilium/pulumi`, then `infra/argocd/pulumi`. The network stack allows in-cluster API/Hubble access plus LAN forwarding to the Gateway and DNS pods. Cilium's VXLAN setting remains enabled but is unused with one node. Cilium agents and other node-level DaemonSets run only on `cp`.

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

Pulumi removing a remote command resource does not undo installed packages, reset kubeadm, or remove a Kubernetes Node. Before retiring any former worker, back up data, confirm every workload and Longhorn volume replica is on `cp`, then drain and delete the worker Node from Kubernetes and remove its Longhorn Node resource. Only then run `sudo kubeadm reset -f` on the retired server. This stack now expects one control-plane server and does not join workers. The Kubernetes stack owns bootstrap; the network stack manages the host firewall; Cilium owns the CNI; Argo CD owns GitOps bootstrap.
