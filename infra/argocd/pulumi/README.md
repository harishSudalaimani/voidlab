# VoidLab Argo CD bootstrap

This Pulumi project installs Argo CD and creates the single root Application, `voidlab-applications`, that bootstraps GitOps. It does not manage workload AppProjects or child Applications. The Helm chart's global node selector schedules Argo CD components on `cp` (`192.168.29.81`), and they tolerate the control-plane taint.

The Helm release name is fixed as `argocd`, and Helm gets 15 minutes for first-install readiness while images are pulled and components start. Argo CD exposes a ClusterIP service, so it requires no additional node-to-node firewall ports.

## Apply after Cilium

Keep the Kubernetes API SSH tunnel open and set `KUBECONFIG` to the kubeconfig created by `infra/kubernetes/pulumi`:

```bash
export KUBECONFIG="$HOME/.kube/voidlab"
cd infra/argocd/pulumi
pulumi preview --stack snharish85-gmail-com-org/voidlab-argocd/argocd
pulumi up --stack snharish85-gmail-com-org/voidlab-argocd/argocd
```

Apply the infrastructure stacks in order: Kubernetes, network, Cilium, and Argo CD. `pulumi up` creates or updates the root Application, which syncs AppProjects and child Applications under `gitops/`. Keep repository credentials out of Git; configure them in Argo CD if the repository is private.

## Access

With the API tunnel and kubeconfig active, forward the internal service:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Open `https://localhost:8080`. Retrieve the initial administrator password directly from the cluster when needed:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -D
```
