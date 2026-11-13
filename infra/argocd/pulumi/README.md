# VoidLab Argo CD installation

This independent Pulumi Go project installs the official Argo CD Helm chart into the existing VoidLab Kubernetes cluster. It creates the `argocd` namespace and Helm release, and schedules all Argo CD workloads onto the Kubernetes node `worker-1` (`worker-01` is not a node name in this cluster).

This project does not manage VMs or bootstrap Kubernetes/Cilium. It installs Argo CD only; a GitOps root `Application` will be added once the repository URL, branch, and application path are known.

## Versions and placement

The project pins Argo Helm chart `10.18.0`, which packages Argo CD `3.6.1` and declares Kubernetes `>=1.25.0`; the existing cluster runs Kubernetes 1.37. The chart is published by the official [`argoproj/argo-helm` project](https://github.com/argoproj/argo-helm/releases). Its `global.nodeSelector` is inherited by the component pods unless overridden, so the configured selector places Argo CD workloads on `worker-1`.

This uses the chart's non-HA defaults and a `ClusterIP` service. Keeping every Argo CD component on one node is suitable for this home lab, but Argo CD will be unavailable if `worker-1` is down. The UI and API are not exposed by a LoadBalancer, NodePort, or ingress; use `kubectl port-forward` through the existing SSH API tunnel.

The Kubernetes Pulumi provider reads the local kubeconfig. It does not copy the kubeconfig or cluster credentials into this project's Pulumi configuration. `Pulumi.dev.yaml` selects the kubeconfig context `kubernetes-admin@kubernetes`; the file path is supplied with `KUBECONFIG` when running Pulumi.

## Files

- `Pulumi.yaml`: project identity `voidlab-argocd` and Pulumi Cloud backend.
- `Pulumi.dev.yaml`: chart, namespace, node selector, and Kubernetes context for the `dev` stack.
- `main.go`: namespace and Helm release resources, plus stack outputs.
- `go.mod`: Pulumi Go SDK and Kubernetes provider SDK dependencies.
- `config/`: reserved for later Argo CD bootstrap configuration; no credentials are stored here.

## Deploy manually

First, ensure the kubeconfig exported by the Kubernetes project exists at `/home/harish/.kube/voidlab`. Start the Kubernetes API tunnel in one terminal and leave it open:

```bash
k -N -L 16443:10.20.0.10:6443
```

In a second terminal, select the kubeconfig and prepare the Go project:

```bash
cd /home/harish/Documents/voidlab/infra/argocd/pulumi
export KUBECONFIG=/home/harish/.kube/voidlab
go mod tidy
gofmt -w main.go
go build ./...
```

The Pulumi Cloud stack identity is `snharish85-gmail-com-org/voidlab-argocd/dev`. If it already exists, select it. If it does not exist, initialize this independent Argo CD stack once:

```bash
pulumi stack select snharish85-gmail-com-org/voidlab-argocd/dev
```

Or, only when it does not exist:

```bash
pulumi stack init snharish85-gmail-com-org/voidlab-argocd/dev
```

Review the plan before applying it:

```bash
pulumi preview --stack snharish85-gmail-com-org/voidlab-argocd/dev
pulumi up --stack snharish85-gmail-com-org/voidlab-argocd/dev
```

The preview should show only the `argocd` namespace and Helm release, with no Libvirt resources or changes to the Kubernetes bootstrap project.

## Access Argo CD

With the API tunnel and `KUBECONFIG` still active, forward the Argo CD HTTPS service:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Open `https://localhost:8080`. The initial username is `admin`. Retrieve the initial password directly from the cluster when needed; do not paste it into source files or Pulumi configuration:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 --decode
printf '\n'
```

Change the initial password after first login. Argo CD's official installation keeps its API server inside the cluster by default; this project preserves that by using a `ClusterIP` service.

## Future GitOps bootstrap

The next step is to point Argo CD at the GitOps repository with a root `Application` or `ApplicationSet`. The repository URL, branch, and directory layout have not been specified, so this project does not create a placeholder application that would fail to sync. After that source is configured, Argo CD can own Cilium and the platform/application projects. Transfer Cilium's existing Helm release deliberately so Pulumi and Argo CD do not reconcile it independently.

## References

- [Official Argo Helm chart releases](https://github.com/argoproj/argo-helm/releases)
- [Pinned chart metadata for 10.18.0](https://github.com/argoproj/argo-helm/blob/argo-cd-10.18.0/charts/argo-cd/Chart.yaml)
- [Official chart values](https://github.com/argoproj/argo-helm/blob/argo-cd-10.18.0/charts/argo-cd/values.yaml)
- [Pulumi Kubernetes provider configuration](https://www.pulumi.com/registry/packages/kubernetes/installation-configuration/)
- [Argo CD installation guide](https://argo-cd.readthedocs.io/en/release-3.6/operator-manual/installation/)
- [Argo CD local access and initial password](https://argo-cd.readthedocs.io/en/stable/try_argo_cd_locally/)
