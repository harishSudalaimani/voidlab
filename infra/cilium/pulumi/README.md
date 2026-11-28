# VoidLab Cilium

This Pulumi project installs Cilium and Hubble on the single-node Kubernetes cluster. Cilium uses the Kubernetes stack's control-plane IP as its API endpoint. VXLAN remains configured but no inter-node tunnel is needed with one node.

## Apply after network

Keep the SSH API tunnel from `infra/kubernetes/pulumi` open and set `KUBECONFIG` to the kubeconfig created there:

```bash
export KUBECONFIG="$HOME/.kube/voidlab"
cd infra/cilium/pulumi
pulumi preview --stack snharish85-gmail-com-org/voidlab-cilium/cilium
pulumi up --stack snharish85-gmail-com-org/voidlab-cilium/cilium
```

The Cilium chart uses Kubernetes PodCIDRs, kube-proxy replacement, L2 announcements, Envoy, Hubble Relay, and Hubble UI. L2 announcements are enabled for the public Istio Gateway VIP; its GitOps policy restricts announcements to `cp` on `enp8s0`. Keep automatic device detection and confirm the `cp` agent selects `enp8s0`. The Istio ambient compatibility values keep CNI chaining enabled (`cni.exclusive=false`), limit socket load-balancing to the host namespace (`socketLB.hostNamespaceOnly=true`), and leave BPF masquerading disabled. The Cilium operator, Hubble Relay, and Hubble UI each have two replicas on `cp` and tolerate the control-plane and initial `NotReady` taints so they can start during CNI bootstrap. Cilium and Envoy each run as a single-node DaemonSet.

Verify with:

```bash
cilium status --wait
kubectl -n kube-system exec ds/cilium -- cilium-dbg config --all | grep -E 'EnableL2Announcements|KubeProxyReplacement'
kubectl -n kube-system exec ds/cilium -- cilium-dbg status --verbose
```

Both `EnableL2Announcements` and `KubeProxyReplacement` should be `true`. Confirm the `cp` agent lists `enp8s0` as a selected device. The expected sequence is Kubernetes, network, Cilium, then Argo CD. Cilium should report its single agent healthy after the chart finishes.
