# VoidLab Cilium

This Pulumi project installs Cilium and Hubble on the two-node Kubernetes cluster. Cilium uses the Kubernetes stack's control-plane IP as its API endpoint and VXLAN for pod networking. It checks that the network stack has verified the direct path between servers before installing; UDP/8472 must be permitted between their node IPs.

## Apply after network

Keep the SSH API tunnel from `infra/kubernetes/pulumi` open and set `KUBECONFIG` to the kubeconfig created there:

```bash
export KUBECONFIG="$HOME/.kube/voidlab"
cd infra/cilium/pulumi
pulumi preview --stack snharish85-gmail-com-org/voidlab-cilium/cilium
pulumi up --stack snharish85-gmail-com-org/voidlab-cilium/cilium
```

The Cilium chart uses Kubernetes PodCIDRs, VXLAN tunneling, kube-proxy replacement, Envoy, Hubble Relay, and Hubble UI. Its Istio ambient compatibility values keep CNI chaining enabled (`cni.exclusive=false`), limit socket load-balancing to the host namespace (`socketLB.hostNamespaceOnly=true`), and leave BPF masquerading disabled. Keep these settings when upgrading Cilium while Istio ambient is installed. The Cilium operator, Hubble Relay, and Hubble UI are pinned to `cp` (`192.168.29.81`) and tolerate the control-plane and initial `NotReady` taints so they can start during CNI bootstrap. The Cilium agent and Envoy DaemonSets run on both nodes because every node needs its own network datapath; this does not schedule application pods on the control plane.

Verify with:

```bash
cilium status --wait
```

The expected sequence is Kubernetes, network, Cilium, then Argo CD. Cilium should report healthy agents on both nodes after the chart finishes.
