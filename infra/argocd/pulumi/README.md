# VoidLab Argo CD bootstrap

This Pulumi project installs Argo CD on the existing Kubernetes cluster and creates the root Application that watches `gitops/`. The Helm chart's global node selector schedules all Argo CD components on `cp` (`192.168.29.81`); they tolerate its Kubernetes control-plane taint. The `argocdNodeName` stack output reports `cp`.

The Helm release name is fixed as `argocd`, and Helm gets 15 minutes for first-install readiness while images are pulled and components start. Argo CD exposes a ClusterIP service, so it requires no additional node-to-node firewall ports.

## Apply after Cilium

Keep the Kubernetes API SSH tunnel open and set `KUBECONFIG` to the kubeconfig created by `infra/kubernetes/pulumi`:

```bash
export KUBECONFIG="$HOME/.kube/voidlab"
cd infra/argocd/pulumi
pulumi preview --stack snharish85-gmail-com-org/voidlab-argocd/argocd
pulumi up --stack snharish85-gmail-com-org/voidlab-argocd/argocd
```

Apply the infrastructure stacks in order: Kubernetes, network, Cilium, and Argo CD. The root Application syncs project and application manifests under `gitops/`. Keep repository credentials out of Git; configure them in Argo CD if the repository is private.

## Access

With the API tunnel and kubeconfig active, forward the internal service:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Open `https://localhost:8080`. Retrieve the initial administrator password directly from the cluster when needed:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -D
```
