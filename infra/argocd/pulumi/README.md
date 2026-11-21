# VoidLab Argo CD bootstrap

This Pulumi project bootstraps Argo CD in the existing Kubernetes cluster and creates one root Argo CD `Application`. The Helm release installs Argo CD; the root Application watches the `gitops` directory so projects, child Applications, and cluster policies are delivered through Argo CD.

## Placement

All Argo CD chart components use the global node selector `kubernetes.io/hostname: worker-1`, configured by `nodeName` in `Pulumi.argocd.yaml`. The `worker-1` node must be Ready and schedulable when applying this stack. If that node is unavailable, Argo CD pods remain Pending instead of moving to another worker. Applications managed by Argo CD have their own scheduling and can run elsewhere unless their manifests set placement rules.

The chart uses its single-replica, non-HA defaults. Its API and UI stay on a `ClusterIP`; access them with `kubectl port-forward` through the control-plane SSH tunnel.

## Configuration and ownership

- `Pulumi.argocd.yaml` pins chart `10.18.2`, Argo CD `v3.6.2`, namespace `argocd`, and node `worker-1`.
- `main.go` manages the namespace, Helm release, bootstrap `AppProject`, and root `Application`. It also configures Argo CD health checks for child `Application` resources and CloudNativePG `Cluster` resources. The child app waves depend on these checks so the next app waits until its dependency is healthy. Pulumi creates the bootstrap project before the root app so that the root app can use `spec.project: bootstrap` on first install; GitOps then reconciles the matching manifest at `gitops/projects/bootstrap/bootstrap.yaml`.
- The root Application watches `gitops` from `https://github.com/harishSudalaimani/voidlab.git`, revision `main`, with automated sync, pruning, and self-healing enabled. Its include pattern applies YAML under `projects/`, `applications/`, and `policies/`; it does not apply Helm values under `values/` or the bootstrap copy under `bootstrap/`. Removing an Application manifest from Git prunes that Application resource.
- Keep Argo CD `AppProject` manifests in `gitops/projects/<project>/`, child `Application` manifests in `gitops/applications/<project>/`, Helm values in `gitops/values/<project>/`, and Cilium policy manifests in `gitops/policies/cilium`. The declarative copy of the root Application is `gitops/bootstrap/root-application.yaml`. Do not add application workloads to this Pulumi project.
- If the GitHub repository is private, configure repository credentials in Argo CD before the root Application can sync. Do not commit a token or deploy key.
- The Kubernetes Pulumi stack remains the one-time cluster bootstrap. Cilium, including Hubble Relay, is managed separately by `infra/cilium/pulumi`; do not add the Cilium release to Argo CD. Argo CD manages other platform and application deployments.

The Kubernetes provider uses the local kubeconfig selected by `KUBECONFIG`; it does not store cluster credentials in this project's Pulumi config. The Argo CD Pulumi stack is independent from the Kubernetes stack.

## Deploy manually

These commands are for you to run on the development machine. They do not SSH to the hypervisor; Pulumi connects through the Kubernetes API tunnel.

In a terminal, go to the Kubernetes project, print the tunnel command exported by its stack, and run that command. Then create a local kubeconfig from the secret stack output. This uses the declared control-plane IP, so it does not depend on a particular VM address:

```bash
cd /Users/harish/Documents/voidlab/infra/kubernetes/pulumi
pulumi stack output sshTunnel --stack snharish85-gmail-com-org/voidlab-kubernetes/k8
# Run the command printed above, then continue here.
umask 077
mkdir -p "$HOME/.kube"
pulumi stack output kubeconfigBase64 --stack snharish85-gmail-com-org/voidlab-kubernetes/k8 --show-secrets | base64 -D > "$HOME/.kube/voidlab"

export KUBECONFIG="$HOME/.kube/voidlab"
kubectl config current-context
kubectl get nodes -o wide
```

Apply the Cilium stack in `infra/cilium/pulumi` first so the nodes are Ready, then select the Argo CD stack and verify the cluster is reachable before previewing:

```bash
cd /Users/harish/Documents/voidlab/infra/argocd/pulumi
pulumi stack select snharish85-gmail-com-org/voidlab-argocd/argocd
pulumi preview --stack snharish85-gmail-com-org/voidlab-argocd/argocd
```

If the stack does not exist yet:

```bash
pulumi stack init snharish85-gmail-com-org/voidlab-argocd/argocd
```

After reviewing the preview, apply it:

```bash
pulumi up --stack snharish85-gmail-com-org/voidlab-argocd/argocd
```

The preview should create the `bootstrap` AppProject if needed and update `voidlab-applications` to use that project, watch `gitops`, include only project, application, and policy YAML, and set the Argo CD health checks used by ordered app waves. It should not modify VMs, Kubernetes nodes, Cilium, or workload resources directly. After the update, Argo CD reads the project and Application manifests from Git and deploys them in their configured sync-wave order. `Pulumi.argocd.yaml` configures the Argo CD stack; the kubeconfig/current context selects the Kubernetes cluster.

## Access Argo CD

With the API tunnel and `KUBECONFIG` still active:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Open `https://localhost:8080`. The initial username is `admin`. Retrieve the initial password directly from the cluster when needed; do not paste it into source files or Pulumi configuration:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -D
printf '\n'
```

Change the initial password after first login. If the repository is private, add its read-only Git credentials to Argo CD so `voidlab-applications` can sync.

## Pinned chart details

The project pins the official Argo Helm chart `10.18.2` from the HTTPS repository `https://argoproj.github.io/argo-helm` and explicitly sets the Argo CD image tag to `v3.6.2`. Using the HTTPS Helm repository avoids the local Docker credential-helper dependency of OCI chart pulls. The chart's `global.nodeSelector` applies the selected hostname to Argo CD components; set `nodeName` to change the target node.

References:

- [Official Argo Helm chart values for 10.18.2](https://github.com/argoproj/argo-helm/blob/argo-cd-10.18.2/charts/argo-cd/values.yaml)
- [Pulumi Kubernetes provider configuration](https://www.pulumi.com/registry/packages/kubernetes/installation-configuration/)
- [Argo CD local access and initial password](https://argo-cd.readthedocs.io/en/stable/try_argo_cd_locally/)
