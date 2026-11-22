# VoidLab GitOps

## Current scope

GitOps deploys Cilium network policies, Longhorn, Infisical, and MinIO. Cilium itself remains installed and managed by Pulumi. Pulumi also installs Argo CD and creates the root `voidlab-applications` Application. That root Application reads the AppProject and child Application manifests from this directory, using Argo CD's built-in `default` project. Workload Applications use their dedicated `networking`, `storage`, or `security` project.

The `networking` AppProject is limited to CiliumNetworkPolicy and CiliumClusterwideNetworkPolicy resources. Add policy manifests under `policies/cilium-network-policies/` and list them in its `kustomization.yaml`; Argo CD applies those policies while Pulumi retains ownership of Cilium IPAM and pod networking. No traffic rules are included yet, so this app does not change workload traffic until policies are added.

Longhorn and MinIO use the `storage` AppProject. One MinIO Application manages both the MinIO Operator and Tenant charts in the `minio` namespace. The tenant runs as a single server on `cp`, tolerates the control-plane taint, and requests a 1 TiB volume from a dedicated Longhorn StorageClass with two replicas and `WaitForFirstConsumer` (about 2 TiB of raw Longhorn capacity).

The Infisical Kubernetes Secrets Operator is a shared add-on under the `security` project; its `InfisicalConnection` and `InfisicalAuth` are reusable by MinIO and future applications. Create a read-only Universal Auth machine identity in the Infisical UI, then create `security/infisical-universal-auth` in Kubernetes with its `clientId` and `clientSecret`. Keep those credentials out of Git. Each application adds only its own `InfisicalStaticSecret` resource and references `infisical-shared` in the `security` namespace. The existing Infisical server release is unchanged.

MinIO's `InfisicalStaticSecret` is configured at `values/storage/minio/resources/infisical-static-secret.yaml` to read project ID `60e9131c-3eef-403a-b2b1-94c393caf930` (project name `voidlab`), environment slug `prod`, path `/minio`, and write `minio-env-configuration`. Keep the MinIO Application on manual sync. After the shared operator and its CRDs are ready, apply this resource once with `kubectl` and wait for the target Secret; then sync the MinIO Application in Argo CD. Argo CD will adopt and manage the resource from that point on.

MinIO's community Operator and Tenant charts are pinned at `7.1.1`; the community repositories were archived in 2026. The Tenant uses Chainguard's public MinIO image (`docker.io/chainguard/minio:latest`) because anonymous pulls from MinIO's old Quay image now fail. Its pool security context matches the image's non-root UID/GID 65532. The `latest` tag follows Chainguard's current build on each pod start. The tenant is configured as a single server and is not a distributed or highly available MinIO deployment.

Infisical uses the official `infisical-standalone` chart with its bundled PostgreSQL and Redis dependencies enabled. These are part of the Infisical Application, not separate platform apps. Infisical, PostgreSQL, and Redis are pinned to `cp`; their persistent data uses Longhorn. Ingress and the chart's bundled ingress controller are disabled; use `kubectl -n security port-forward svc/infisical-infisical-standalone-infisical 8082:8080` and open `http://localhost:8082` for initial setup.

### Infisical bootstrap secret

Run this once after the `security` namespace exists. It creates only the bootstrap Secret Infisical needs to start; do not commit its values:

```sh
kubectl -n security create secret generic infisical-secrets \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=ENCRYPTION_KEY="$(openssl rand -hex 16)" \
  --from-literal=SITE_URL="http://localhost:8082"
```

The Infisical chart already references `infisical-secrets`. After this Secret is created, the pod should start; later application credentials belong in Infisical.

Longhorn control components are pinned to `cp`; Longhorn's node manager and storage workloads run on both configured storage nodes (`cp` and `worker`). The default StorageClass uses two replicas.

Longhorn stores data on `cp`'s `/data/vms/longhorn` SSD and `/storage/longhorn` HDD mounts, and on `worker`'s `/var/lib/longhorn` root filesystem. With two replicas and node-level replica anti-affinity, the worker root disk is the capacity limit; usable volume capacity is much lower than the sum of all three disks. Disk scheduling keeps a 15% free-space threshold, but this is not a hard cap for snapshot growth or volume writes, so monitor disk usage and leave host space available. The Longhorn Node annotation configures disks when Longhorn first discovers a node; it does not rewrite disks already present in Longhorn's Node resources.

The bundled PostgreSQL and Redis instances are single-instance proof-of-concept dependencies, not HA services. Add other shared data services or application workloads later as separate GitOps Applications after this phase is confirmed healthy.

## Pruning

Child Applications use automated sync, self-heal, prune, `allowEmpty`, and Argo CD's resources finalizer unless called out above. The MinIO Application stays manual until its Infisical secret source is configured. Removing an Application manifest from Git removes the Application and cascades deletion to resources it manages. Removing a resource from an Application source prunes that resource.

## Structure

Keep each component in the existing project/application/values layout:

```text
applications/
├── networking/policies/application.yaml
├── security/infisical/application.yaml
├── security/infisical-secrets-operator/application.yaml
├── storage/longhorn/application.yaml
└── storage/minio/application.yaml

projects/
├── networking/networking.yaml
├── security/security.yaml
└── storage/storage.yaml

values/
├── security/infisical-secrets-operator/values.yaml and resources/
├── storage/minio/operator-values.yaml, tenant-values.yaml, and resources/
├── security/infisical/values.yaml and resources/
└── storage/longhorn/values.yaml and resources/

policies/
└── cilium-network-policies/kustomization.yaml and policy manifests
```

Helm values and component manifests stay under `values/<project>/<application>/`. AppProjects and child Applications stay under `projects/` and `applications/`. Do not commit secret values as plaintext.
