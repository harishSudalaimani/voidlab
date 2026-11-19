# VoidLab Kubernetes bootstrap

This independent Pulumi Go project configures the six Ubuntu Server 24.04 VMs for Kubernetes 1.37: it initializes kubeadm on `cp`, joins five workers split across two hypervisors, installs Cilium as the CNI, waits for all six nodes to become Ready, and exports a kubeconfig for use through an SSH tunnel.

It does not create or manage VMs. It does not install Argo CD, Kubernetes platform services, or applications.

## Cilium version and network settings

The stack pins Cilium `1.21.0-pre.4` and Cilium CLI `v0.20.1` in `Pulumi.k8.yaml`. Cilium 1.21 is a prerelease as of this project setup. Cilium's current development compatibility table includes Kubernetes 1.37, while its current stable documentation is for Cilium 1.20.4 and does not list Kubernetes 1.37. The selected prerelease is therefore an early-access choice for the requested Kubernetes version, not a stable Cilium release. Change `ciliumVersion` after a stable Cilium release documents Kubernetes 1.37 support.

The cluster uses kubeadm without its kube-proxy phase, and Cilium runs in full kube-proxy replacement mode. Cilium uses kubeadm's per-node PodCIDRs (`ipam.mode=kubernetes`), VXLAN tunneling across a routed WireGuard link between the hypervisors, and the control-plane IP and port for direct API server access. The operator is limited to one replica for this small cluster. The Cilium CLI archive is checked against that release's SHA-256 file. Pulumi waits for Cilium and all six Kubernetes nodes to become Ready.

Argo CD will later need a deliberate ownership handoff for the existing Cilium Helm release if GitOps is to manage Cilium upgrades and configuration. Avoid configuring Pulumi and Argo CD to independently reconcile the same Cilium release.

## Safety and prerequisites

- Pulumi state belongs to the independent Pulumi Cloud project `voidlab-kubernetes`; no stack is created by these files.
- SSH connections to `cp`, `worker-1`, and `worker-2` go through host1 (`192.168.29.52`). Connections to `worker-3`, `worker-4`, and `worker-5` go through host2 (`192.168.29.81`). The Pulumi Command provider verifies both hypervisors and all six VM host keys using the existing local `known_hosts` entries and read-only scans from each authenticated hypervisor.
- The VM SSH private key is read from `/Users/harish/.ssh/voidlab`; the hypervisor keys are read from `/Users/harish/.ssh/voidlab` and `/Users/harish/.ssh/dark`. They are not stored in this repository or Pulumi config. Pulumi treats the key inputs and bootstrap outputs as secrets.
- All six VMs must have routed node-to-node connectivity before bootstrapping. The two libvirt NAT networks remain separate; a WireGuard tunnel between the hypervisors must route `10.20.0.0/24` and `10.21.0.0/24` in both directions and allow Cilium VXLAN traffic.
- The hypervisor setup installs `wireguard-tools`, writes the WireGuard configuration, opens UDP 51820, enables forwarding, assigns `wg-voidlab` to a dedicated firewalld zone, and adds subnet-scoped firewalld policies. It ensures the existing `voidlab-network` is active and set to autostart, installs a libvirt network hook, and explicitly applies and verifies the routed-subnet allow and NAT-bypass rules in libvirt's own nftables chains before node preflight. The hook reapplies the rules whenever `voidlab-network` starts or updates after libvirt loads the hook. It requires passwordless sudo and an already active `firewalld`; it does not enable firewalld automatically.
- The VM preflight checks OS, hostname, IP address, RAM, cgroup version, CPU count, and TCP reachability to every node. Kubernetes package installation starts only after all six preflights pass.
- `cp` is configured with one vCPU. You chose to accept the Kubernetes 1.37 kubeadm CPU preflight exception; the project records that choice and passes `--ignore-preflight-errors=NumCPU` to kubeadm. This is below the upstream recommendation of two CPUs for a control-plane node.
- After the preflight, updates disable swap, configure containerd with systemd cgroups, install and hold kubelet/kubeadm/kubectl from the official `v1.37` apt repository, and perform kubeadm bootstrap. These are changes inside all six Ubuntu guests.
- kubeadm tokens and the exported kubeconfig are secret Pulumi outputs. Do not use `--show-secrets` in a shared terminal or paste those outputs into chat.

## SSH host-key configuration

SSH host-key verification is automatic. The Pulumi program reads the two hypervisor host keys from the development machine's `~/.ssh/known_hosts` (checking each host IP and its `k`/`k1` shortcut). Each hypervisor then scans only its own private libvirt network for the VM host keys. Those discovered keys are passed to the SSH connections to the six guests; they are not saved as Pulumi config.

Before the first preview, connect to both hypervisors with the existing trusted SSH shortcuts so their keys are present in `known_hosts`. The VM scans run during `pulumi up`; if a VM's SSH service is not ready yet or the hypervisor lacks `ssh-keyscan`, the scan fails with the affected IP.

If the Pulumi Cloud stack does not exist yet, create it once. This creates only the Kubernetes project's independent state; `Pulumi.k8.yaml` supplies the VM addresses, SSH key paths, and single-CPU control-plane exception:

```bash
cd /Users/harish/Documents/voidlab/infra/kubernetes/pulumi
pulumi stack init snharish85-gmail-com-org/voidlab-kubernetes/k8
```

## Validate and deploy manually

Run these commands on the Fedora GUI development machine. The named Pulumi Cloud stack must exist first; this project does not initialize stacks.

```bash
cd /Users/harish/Documents/voidlab/infra/kubernetes/pulumi
gofmt -w main.go
pulumi preview --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
```

After the successful bootstrap, the preview should show no changes unless you intentionally modify configuration or scripts. This project manages remote hypervisor networking and Kubernetes bootstrap commands; it must not show Libvirt or VM resources. Apply only a reviewed plan:

```bash
pulumi up --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
```

An intended bootstrap update initializes `cp` without kube-proxy, joins all five workers, installs the configured Cilium prerelease in replacement mode, waits for all six nodes to become Ready, and exports a kubeconfig. Cilium's kube-proxy-free setup uses the API server address and port directly, as described in its [kubeadm guide](https://docs.cilium.io/en/latest/network/kubernetes/kubeproxy-free/).

## Connect kubectl

After a successful update, save the secret kubeconfig output on the development machine:

```bash
umask 077
mkdir -p ~/.kube
pulumi stack output kubeconfigBase64 --stack snharish85-gmail-com-org/voidlab-kubernetes/k8 --show-secrets | base64 --decode > ~/.kube/voidlab
```

Keep an SSH tunnel open in a separate terminal:

```bash
k -N -L 16443:10.20.0.10:6443
```

Then query the cluster from another terminal:

```bash
KUBECONFIG=~/.kube/voidlab kubectl get nodes -o wide
```

The bootstrap waits until all six nodes report `Ready`; Cilium's agents and operator must be healthy for that to complete.

## Recovery notes

- Pulumi remote commands do not have delete commands, so removing a command resource from state will not uninstall packages, reset kubeadm, or delete cluster data.
- WireGuard keys, interface configuration, routes, sysctl settings, firewalld zones and policies, libvirt nftables rules, and the libvirt network hook persist on both hypervisors if this stack is destroyed. The hook installer preserves a pre-existing `/etc/libvirt/hooks/network` script at `/etc/libvirt/hooks/network.voidlab-original`; remove the VoidLab setup manually only when you intentionally retire the routed link.
- Cilium is installed by a remote command and persists in the cluster. Removing that Pulumi command from state does not uninstall Cilium. Plan any migration of its Helm release to Argo CD before GitOps begins managing it.
- `joinTokenGeneration` is a deliberate rerun trigger for control-plane init, worker joins, readiness checking, and kubeconfig export. Increment it only when you need to rerun that bootstrap sequence. Do not paste the generated token into source or a non-secret Pulumi setting.
- Do not rerun `kubeadm init` manually on an initialized control plane. The bootstrap script checks for `/etc/kubernetes/admin.conf` before initializing.
