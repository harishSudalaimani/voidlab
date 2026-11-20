# VoidLab Kubernetes bootstrap

This Pulumi project configures Kubernetes on the VMs declared in `infra/vm/pulumi/Pulumi.host*.yaml`. It reads the network stack's VM IPs and verified routing result, prepares each node, initializes kubeadm on the node marked `role: control-plane`, and joins every node marked `role: worker`.

This project manages Kubernetes inside the VMs. VM creation and host networking belong to [`infra/vm/pulumi`](../../vm/pulumi/README.md) and [`infra/network/pulumi`](../../network/pulumi/README.md). Cilium and Hubble Relay belong to [`infra/cilium/pulumi`](../../cilium/pulumi/README.md). Argo CD follows Cilium.

## Stack order

Run the VM stack for each host first, then the network stack, then Kubernetes, Cilium, and Argo CD. The network project checks TCP/22 reachability between all declared nodes and exports `routingVerified`. Kubernetes will not start node commands until that output is true.

## How nodes are chosen

Every host file lists its VMs under `nodes`. The `role` field determines how Kubernetes treats the VM:

- One node must have `role: control-plane`.
- All other cluster nodes should have `role: worker`.

The current kubeadm bootstrap supports one control plane. The inventory loader checks for exactly one. Adding a worker to a host file makes network and Kubernetes discover it on their next updates; no IP list or Go code needs editing. Follow the host-add steps in the VM and network READMEs, then update those stacks before this one.

The same host entry supplies the SSH address, user, and key for the hypervisor jump connection, plus the VM SSH user and key. The Kubernetes program scans the VM SSH host keys from the corresponding hypervisor and verifies the host key before connecting.

## What the Kubernetes stack does

After all VM preflight checks pass, it installs the pinned Kubernetes packages and container runtime, initializes kubeadm, joins the workers, waits for the configured number of nodes to register, and exports a kubeconfig. It waits for node registration, not `Ready`: Cilium is installed separately afterward.

The control plane and two 12 GiB workers are on host1 (server2). The control plane has a 30 GiB system disk and no data disk. Each worker has a 100 GiB system disk; host1's workers also have 800 GiB data disks. Host2 (server1) has two workers with 7 GiB RAM and no data disks. All workers have 2 vCPUs. The preflight checks each node's role and available CPU and memory.

The Kubernetes version is currently set to `1.37` in the program. The Pod CIDR is a Kubernetes bootstrap setting in `Pulumi.k8.yaml`; it is not a host route or VM subnet.

## Run manually

From this directory, preview and apply the existing Kubernetes stack after the VM and network stacks have completed:

```bash
pulumi preview --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
pulumi up --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
```

The preview should show guest and kubeadm commands only. It should not show VM, libvirt, WireGuard, or hypervisor firewall resources.

## Connect kubectl

After a successful update, save the secret kubeconfig output on your development machine:

```bash
umask 077
mkdir -p "$HOME/.kube"
pulumi stack output kubeconfigBase64 --stack snharish85-gmail-com-org/voidlab-kubernetes/k8 --show-secrets | base64 -D > "$HOME/.kube/voidlab"
```

Keep the API tunnel open in one terminal. The stack exports the command as `sshTunnel`; it uses host1's SSH alias when configured, or its SSH username and address otherwise:

```bash
pulumi stack output sshTunnel --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
```

Run that printed command, then use another terminal:

```bash
KUBECONFIG="$HOME/.kube/voidlab" kubectl get nodes -o wide
```

Nodes may show `NotReady` until Cilium has been applied. Keep the tunnel and kubeconfig available when applying Cilium and Argo CD.

## Reruns and teardown

Remote commands do not undo packages or kubeadm state when their Pulumi resources are removed. The `joinTokenGeneration` config value is a deliberate rerun trigger for the kubeadm bootstrap commands; increment it only when you need to rerun that sequence. Keep host files and the network stack while Kubernetes uses those nodes.
