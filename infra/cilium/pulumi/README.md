# VoidLab Cilium Pulumi project

This independent Pulumi project manages the Cilium Helm release in `kube-system`. It keeps the CNI separate from kubeadm bootstrap in `infra/kubernetes/pulumi` and enables Hubble Relay. It reads the API server IP from the Kubernetes stack; the Kubernetes provider uses the kubeconfig selected by `KUBECONFIG`, so cluster credentials are not stored in Pulumi config.

## Configuration

`Pulumi.cilium.yaml` pins Cilium `1.21.0-pre.4`, references the Kubernetes stack for the control-plane address, and targets the `kube-system` namespace. The version is currently a prerelease, matching the version previously used by the Kubernetes bootstrap.

This project owns the CNI configuration and version. The kubeadm bootstrap keeps the kube-proxy phase disabled so this release can run in full kube-proxy replacement mode. The cluster Pod CIDR remains a kubeadm setting in the Kubernetes bootstrap project; Cilium uses kubeadm's assigned per-node PodCIDRs.

The Cilium operator, Hubble Relay, and Hubble UI are pinned to `worker-1` with the `kubernetes.io/hostname` label. The Cilium agent and Envoy remain DaemonSets and run on every node; they provide node networking and proxy support and must not be restricted to one worker.

The chart keeps the existing cluster network settings:

- Kubernetes PodCIDR IPAM (`ipam.mode=kubernetes`)
- kube-proxy replacement
- VXLAN tunneling
- One Cilium operator replica
- Envoy enabled
- Hubble and Hubble Relay enabled
- Hubble UI enabled on `worker-1`

Hubble Relay connects to Hubble servers on the Cilium agents using TCP port 4244. Keep that port reachable between cluster nodes; the network stack builds its routes and forwarding rules from the VM subnets in the host inventory. Hubble UI is enabled and pinned to `worker-1` with the other control components.

For VXLAN, the routed WireGuard link must pass overlay traffic between every VM subnet declared in the host inventory.

## Deploy

Create the VMs, apply `infra/network/pulumi`, complete the Kubernetes bootstrap, and save its kubeconfig as described in `infra/kubernetes/pulumi/README.md`. Keep the `sshTunnel` command exported by Kubernetes running and set `KUBECONFIG` to that file. Initialize this Pulumi stack once if it does not already exist, then preview and inspect the Helm release diff:

```bash
cd /Users/harish/Documents/voidlab/infra/cilium/pulumi
export KUBECONFIG="$HOME/.kube/voidlab"
# Only if this Pulumi stack does not exist yet:
pulumi stack init snharish85-gmail-com-org/voidlab-cilium/cilium
# Then select it before previewing:
pulumi stack select snharish85-gmail-com-org/voidlab-cilium/cilium
pulumi preview --stack snharish85-gmail-com-org/voidlab-cilium/cilium
```

After reviewing the preview, apply it:

```bash
pulumi up --stack snharish85-gmail-com-org/voidlab-cilium/cilium
```

Verify the result with the Cilium CLI:

```bash
cilium status --wait
```

The status should report `Cilium: OK`, `Operator: OK`, `Envoy DaemonSet: OK`, and `Hubble Relay: OK`; ClusterMesh remains disabled. Check that the operator, Relay, and UI pods are on `worker-1`, while Cilium and Envoy agent pods appear on every node.
