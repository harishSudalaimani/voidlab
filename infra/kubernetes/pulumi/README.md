# VoidLab Kubernetes bootstrap

This independent Pulumi Go project configures the four existing Ubuntu Server 24.04 VMs for Kubernetes 1.37, initializes kubeadm on `cp`, joins the three workers, installs Cilium as the CNI, waits for the nodes to become Ready, and exports a kubeconfig for use through an SSH tunnel.

It does not create or manage VMs. It does not install Argo CD, Kubernetes platform services, or applications.

## Cilium version and network settings

The stack pins Cilium `1.21.0-pre.4` and Cilium CLI `v0.20.1` in `Pulumi.dev.yaml`. Cilium 1.21 is a prerelease as of this project setup. Cilium's current development compatibility table includes Kubernetes 1.37, while its current stable documentation is for Cilium 1.20.4 and does not list Kubernetes 1.37. The selected prerelease is therefore an early-access choice for the requested Kubernetes version, not a stable Cilium release. Change `ciliumVersion` after a stable Cilium release documents Kubernetes 1.37 support.

For a fresh cluster, kubeadm skips its kube-proxy phase and Cilium is installed in full kube-proxy replacement mode. Cilium uses kubeadm's per-node PodCIDRs (`ipam.mode=kubernetes`), VXLAN tunneling across the VoidLab private VM network, and the control-plane IP and port for direct API server access. The operator is limited to one replica for this small cluster. The Cilium CLI archive is checked against the SHA-256 file published with that CLI release. The deployment waits for Cilium status and all four Kubernetes nodes to become Ready.

The existing `dev` cluster was initialized with kube-proxy and Cilium configured with `kubeProxyReplacement=false`. The last Pulumi update already reset Kubernetes on all four guests and removed the control plane's local etcd data. It failed before reinitialization because Pulumi did not detect input changes for the existing init and worker-join commands; Cilium then correctly reported that `/etc/kubernetes/admin.conf` was missing. The reset script and its logic have been removed. The VMs and disks remain intact.

Argo CD will later need a deliberate ownership handoff for the existing Cilium Helm release if GitOps is to manage Cilium upgrades and configuration. Avoid configuring Pulumi and Argo CD to independently reconcile the same Cilium release.

## Safety and prerequisites

- Pulumi state belongs to the independent Pulumi Cloud project `voidlab-kubernetes`; no stack is created by these files.
- SSH connections go through the Fedora hypervisor (`192.168.29.52`) to the VM NAT addresses. The Pulumi Command provider verifies the hypervisor and each VM host key. It refuses to connect when those keys are not configured.
- The private SSH key is read from `/home/harish/.ssh/id_ed25519_voidlab` at runtime. It is not stored in this repository or Pulumi config. Pulumi treats the key input and bootstrap outputs as secrets.
- The preflight commands only inspect OS, hostname, IP address, RAM, cgroup version, and CPU count. Package installation starts only after all four preflights pass.
- `cp` is configured with one vCPU. You chose to accept the Kubernetes 1.37 kubeadm CPU preflight exception; the project records that choice and passes `--ignore-preflight-errors=NumCPU` to kubeadm. This is below the upstream recommendation of two CPUs for a control-plane node.
- After the preflight, updates disable swap, configure containerd with systemd cgroups, install and hold kubelet/kubeadm/kubectl from the official `v1.37` apt repository, and perform kubeadm bootstrap. These are changes inside the four Ubuntu guests.
- kubeadm tokens and the exported kubeconfig are secret Pulumi outputs. Do not use `--show-secrets` in a shared terminal or paste those outputs into chat.

## SSH host-key configuration

The Command provider's SSH host-key verification is mandatory here. Configure the public host key for the hypervisor and for each VM. Each value must contain only the key type and base64 key, for example `ssh-ed25519 AAAAC3...`.

You can collect candidate public keys with `ssh-keyscan`, then verify their fingerprints through a trusted channel before configuring them. Do not treat a scan by itself as verification.

```bash
# Hypervisor key from the development machine:
ssh-keyscan -t ed25519 192.168.29.52

# VM keys from the hypervisor, which can reach the NAT subnet:
k 'for ip in 10.20.0.10 10.20.0.11 10.20.0.12 10.20.0.13; do ssh-keyscan -t ed25519 "$ip" 2>/dev/null; done'
```

If the Pulumi Cloud stack does not exist yet, create it once. This creates only the Kubernetes project's independent state:

```bash
cd /home/harish/Documents/voidlab/infra/kubernetes/pulumi
pulumi stack init snharish85-gmail-com-org/voidlab-kubernetes/dev
```

Set each verified key, replacing the placeholders with the key type and key data (omit the host/address column):

The `HYPERVISOR_KEY_DATA`, `CP_KEY_DATA`, and `WORKER_*_KEY_DATA` strings below are placeholders and must never be entered literally. Copy the key type and base64 field from the matching `ssh-keyscan` line after verifying its fingerprint. For example, from `192.168.29.52 ssh-ed25519 AAAA...`, use `ssh-ed25519 AAAA...` as the value.

```bash
cd /home/harish/Documents/voidlab/infra/kubernetes/pulumi
pulumi config set voidlab-kubernetes:hypervisorHostKey 'ssh-ed25519 HYPERVISOR_KEY_DATA' --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
pulumi config set voidlab-kubernetes:cpHostKey 'ssh-ed25519 CP_KEY_DATA' --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
pulumi config set voidlab-kubernetes:worker1HostKey 'ssh-ed25519 WORKER_1_KEY_DATA' --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
pulumi config set voidlab-kubernetes:worker2HostKey 'ssh-ed25519 WORKER_2_KEY_DATA' --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
pulumi config set voidlab-kubernetes:worker3HostKey 'ssh-ed25519 WORKER_3_KEY_DATA' --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
```

These are public keys, not secrets. The private key is never passed through a shell command or saved by these config commands.

## Validate and deploy manually

Run these commands on the Fedora GUI development machine. The named Pulumi Cloud stack must exist first; this project does not initialize stacks.

```bash
cd /home/harish/Documents/voidlab/infra/kubernetes/pulumi
gofmt -w main.go
go mod tidy
pulumi preview --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
```

To finish the rebuild, remove the now-unused reset setting and increment `joinTokenGeneration`. This changes the control-plane init input, which issues a new join token; the new token triggers worker joins. The same generation is passed to the readiness and kubeconfig commands so they run against the new cluster too.

```bash
pulumi config set voidlab-kubernetes:joinTokenGeneration 2 --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
pulumi preview --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
```

The preview should show the four old `reset-kubernetes-*` command resources being removed from Pulumi state, plus updates for `init-control-plane`, the three worker joins, Cilium, node readiness, and kubeconfig export. Removing those command resources from state does not execute commands on the guests. It must not show Libvirt or VM resources. After reviewing that plan, apply:

```bash
pulumi up --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
```

The update reinitializes `cp` without kube-proxy, joins the workers, installs the configured Cilium prerelease in replacement mode, waits for all nodes to become Ready, and exports a fresh kubeconfig. Cilium's kube-proxy-free setup uses the API server address and port directly, as described in its [kubeadm guide](https://docs.cilium.io/en/latest/network/kubernetes/kubeproxy-free/).

## Connect kubectl

After a successful update, save the secret kubeconfig output on the development machine:

```bash
umask 077
mkdir -p ~/.kube
pulumi stack output kubeconfigBase64 --stack snharish85-gmail-com-org/voidlab-kubernetes/dev --show-secrets | base64 --decode > ~/.kube/voidlab
```

Keep an SSH tunnel open in a separate terminal:

```bash
k -N -L 16443:10.20.0.10:6443
```

Then query the cluster from another terminal:

```bash
KUBECONFIG=~/.kube/voidlab kubectl get nodes -o wide
```

The bootstrap waits until the four nodes report `Ready`; Cilium's agents and operator must be healthy for that to complete.

## Recovery notes

- Pulumi remote commands do not have delete commands, so removing a command resource from state will not uninstall packages, reset kubeadm, or delete cluster data.
- Cilium is installed by a remote command and persists in the cluster. Removing that Pulumi command from state does not uninstall Cilium. Plan any migration of its Helm release to Argo CD before GitOps begins managing it.
- `joinTokenGeneration` is a deliberate rerun trigger for control-plane init, worker joins, readiness checking, and kubeconfig export. Increment it only when you need to rerun that bootstrap sequence. Do not paste the generated token into source or a non-secret Pulumi setting.
- Do not rerun `kubeadm init` manually on an initialized control plane. The bootstrap script checks for `/etc/kubernetes/admin.conf` before initializing.
