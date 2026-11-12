# VoidLab Kubernetes bootstrap

This independent Pulumi Go project configures the four existing Ubuntu Server 24.04 VMs for Kubernetes 1.37, initializes kubeadm on `cp`, joins the three workers, and exports a kubeconfig for use through an SSH tunnel.

It does not create or manage VMs. It does not install a CNI, Cilium, Argo CD, Kubernetes platform services, or applications. Nodes are expected to show `NotReady` until Cilium is installed later through the Argo CD project.

With no CNI, normal pods cannot become Ready, including a standard Argo CD installation. The later Argo CD bootstrap must account for this dependency (for example, bootstrap Cilium before Argo CD, or use an explicitly designed host-network bootstrap). This project leaves that choice and all CNI installation for the later step.

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

Review the preview. It should show only `command:remote:Command` operations for preflight, guest setup, kubeadm init, worker join, node registration, and kubeconfig export. It must not show VM, libvirt, network, storage, CNI, or Argo CD resources. Then apply only if that is the intended change:

```bash
pulumi up --stack snharish85-gmail-com-org/voidlab-kubernetes/dev
```

The first update runs read-only preflights on all nodes. If any preflight fails, no guest package changes start. The remaining update installs Kubernetes 1.37 and bootstraps the cluster.

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

Nodes are expected to be `NotReady` until Cilium is installed later. This project intentionally does not apply any CNI manifest.

## Recovery notes

- Pulumi remote commands do not have delete commands, so removing a command resource from state will not uninstall packages, reset kubeadm, or delete cluster data.
- If a failed or delayed worker join outlives the kubeadm token, increment `joinTokenGeneration` in the stack config to make Pulumi safely re-run the idempotent control-plane step and generate a fresh secret token, then preview and apply again. For example: `pulumi config set voidlab-kubernetes:joinTokenGeneration 2 --stack snharish85-gmail-com-org/voidlab-kubernetes/dev`. Do not paste the token into source or a non-secret Pulumi setting.
- Do not rerun `kubeadm init` manually on an initialized control plane. The bootstrap script checks for `/etc/kubernetes/admin.conf` before initializing.
