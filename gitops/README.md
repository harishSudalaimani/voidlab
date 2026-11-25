# VoidLab GitOps

## Current scope

GitOps deploys Cilium network policies, Istio ambient, Longhorn, Infisical, MinIO, cert-manager, Infisical's PKI issuer, and the observability stack. Cilium itself remains installed and managed by Pulumi. Pulumi also installs Argo CD and creates the root `voidlab-applications` Application. That root Application reads the AppProject and child Application manifests from this directory, using Argo CD's built-in `default` project. Workload Applications use their dedicated `networking`, `service-mesh`, `storage`, `security`, or `observability` project.

The `networking` AppProject is limited to CiliumNetworkPolicy and CiliumClusterwideNetworkPolicy resources. Add policy manifests under `policies/cilium-network-policies/` and list them in its `kustomization.yaml`; Argo CD applies those policies while Pulumi retains ownership of Cilium IPAM and pod networking. No traffic rules are included yet, so this app does not change workload traffic until policies are added.

The Istio stack uses ambient mode and Gateway API. It is kept separate from the narrow Cilium `networking` project under the `service-mesh` AppProject. Istio 1.32.0 and Gateway API v1.6.1 are pinned together because Istio 1.32 lists Gateway API v1.6.1 as its tested version and supports Kubernetes 1.37. The Gateway API CRDs are sourced from the upstream tagged repository, using its `config/crd/experimental` manifests. The Gateway API CRD Application uses server-side apply and does not prune CRDs, since deleting a CRD also deletes every Gateway API object.

The two CNI components have separate roles: Cilium assigns Pod IPs and provides primary pod networking; Istio CNI is chained after Cilium to set up ambient traffic redirection through ztunnel. Istio CNI and ztunnel run as DaemonSets across every node, including `cp`. Cilium remains installed and managed by Pulumi; the added values only configure Cilium to coexist with Istio's chained plugin and redirection.

**Apply the Pulumi Cilium compatibility update before syncing `istio-cni`.** This cluster uses Cilium kube-proxy replacement. The Pulumi stack now sets `cni.exclusive=false` and `socketLB.hostNamespaceOnly=true` for Istio chaining and redirection, and explicitly leaves `bpf.masquerade=false` for ambient health-probe compatibility. Run `pulumi preview` and apply the Cilium stack update before syncing the manual `istio-cni` Application. Do not enroll workloads before both node DaemonSets are healthy. [Cilium's Istio integration guide](https://docs.cilium.io/en/latest/network/servicemesh/istio/) [Istio's Cilium prerequisites](https://istio.io/latest/docs/ambient/install/platform-prerequisites/)

The Istio controller and Kiali are pinned to `cp` and tolerate the control-plane taint. Istiod creates a waypoint when you add a Gateway API `Gateway` using class `istio-waypoint`; no waypoint is created until a namespace or service needs L7 processing. No application namespace is enrolled in ambient mode by default. Do not enroll workloads until Istio CNI and ztunnel are installed and verified on every node.

Kiali uses the Prometheus service installed with the observability stack for graph metrics and metric-based health views. Kiali uses its default token authentication and stays internal; use `kubectl -n istio-system port-forward svc/kiali 20001:20001` to open the UI. No public Gateway, DNS name, or Let's Encrypt Certificate is created in this phase; those require the external hostname and public address/provider details.

The Istio child Applications are manual-sync so the CRDs and components can be installed in dependency order. Sync these Applications in this order:

1. `istio-base`
2. `gateway-api-crds`
3. `istiod`
4. `istio-cni` (only after Cilium compatibility is in place)
5. `ztunnel`
6. `istio-gateway-placement`
7. `kiali`

Verify with `kubectl get ds -n istio-system` and `kubectl get pods -n istio-system -o wide`; there should be one Istio CNI and one ztunnel pod on each node. Also check `kubectl get gatewayclass`. Keep application namespaces unlabeled until both DaemonSets are healthy. Use a matching Istio 1.32 `istioctl` for diagnostics.

Longhorn and MinIO use the `storage` AppProject. One MinIO Application manages both the MinIO Operator and Tenant charts in the `minio` namespace. The tenant runs as a single server on `cp`, tolerates the control-plane taint, and requests a 1 TiB volume from a dedicated Longhorn StorageClass with two replicas and `WaitForFirstConsumer` (about 2 TiB of raw Longhorn capacity).

The Infisical Kubernetes Secrets Operator is a shared add-on under the `security` project; its `InfisicalConnection` and `InfisicalAuth` are reusable by MinIO and future applications. Create a read-only Universal Auth machine identity in the Infisical UI, then create `security/infisical-universal-auth` in Kubernetes with its `clientId` and `clientSecret`. Keep those credentials out of Git. Each application adds only its own `InfisicalStaticSecret` resource and references `infisical-shared` in the `security` namespace. The existing Infisical server release is unchanged.

The `cert-manager` Application installs cert-manager and the Infisical PKI Issuer together in the `cert-manager` namespace. cert-manager's CRDs are enabled and retained. The issuer image is pinned to `v1.1.0`; the Helm chart is pinned to `1.0.1`. Both controllers are scheduled on `cp` and tolerate its control-plane taint. The first sync is manual: the cluster bootstrap pins Kubernetes `1.37`, while cert-manager's latest stable `1.21.3` release is officially tested only through Kubernetes `1.36`; upstream lists `1.22` as upcoming. Do not sync this Application until a stable cert-manager release supports Kubernetes `1.37`, or after choosing to run the current version outside its tested range.

Before enabling the Infisical issuer, create a Certificate Management application/profile with API enrollment and authorize a machine identity to issue certificates in that application. A dedicated Universal Auth identity is preferred; the existing Secrets Operator identity can only be reused if it is explicitly granted the application's Operator role, which also gives it certificate issuance access. Store the issuer identity credentials in a Kubernetes Secret in the controller's cluster-resource namespace (`cert-manager` by default), never in Git. The issuer should connect to the in-cluster Infisical service at `http://infisical-infisical-standalone-infisical.security.svc.cluster.local:8080`. The cert-manager Application includes the external-issuer approver RBAC at `values/security/cert-manager/resources/issuer-approver-rbac.yaml`; the security AppProject permits the Infisical `ClusterIssuer` kind. Add the actual ClusterIssuer manifest after choosing the Application/Profile names. Then reference it from `cert-manager.io/v1` Certificate resources in workload namespaces. The PKI root/intermediate trust chain must also be distributed to clients that need to verify issued certificates.

MinIO's `InfisicalStaticSecret` is configured at `values/storage/minio/resources/infisical-static-secret.yaml` to read project ID `60e9131c-3eef-403a-b2b1-94c393caf930` (project name `voidlab`), environment slug `prod`, path `/minio`, and write `minio-env-configuration`. Keep the MinIO Application on manual sync. After the shared operator and its CRDs are ready, apply this resource once with `kubectl` and wait for the target Secret; then sync the MinIO Application in Argo CD. Argo CD will adopt and manage the resource from that point on.

The `minio-observability-access` Application provisions the Loki/Tempo service account from the Infisical keys at `/observability`. Sync the `minio` Application once after this change so its `/minio` credentials Secret includes the root credential keys needed by the provisioner. After the MinIO Tenant is healthy and that Secret is refreshed, sync `minio-observability-access`. It creates a MinIO service account with an inline policy limited to `loki-chunks`, `loki-ruler`, and `tempo-traces`; a CronJob reapplies the credentials and policy every ten minutes so Infisical rotations are reconciled. The same Infisical credentials are synced into the `observability` namespace for Loki and Tempo.

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

## Observability

The `observability` AppProject installs kube-prometheus-stack, Loki, Tempo, and an OpenTelemetry Collector gateway in the `observability` namespace. kube-prometheus-stack supplies Prometheus, Grafana, Alertmanager, kube-state-metrics, and node-exporter. Prometheus, Grafana, Alertmanager, kube-state-metrics, Loki, Tempo, and the Collector are pinned to `cp` and tolerate its control-plane taint. Node-exporter remains a DaemonSet on both `cp` and `worker` so Prometheus gets host metrics from each node. Prometheus, Grafana, Loki, and Tempo use Longhorn PVCs; Loki and Tempo store log and trace blocks in the existing MinIO tenant over HTTPS. The S3 clients skip verification of MinIO's operator-generated internal certificate.

Add these four secrets to the `voidlab` Infisical project (`60e9131c-3eef-403a-b2b1-94c393caf930`), environment `prod`, path `/observability`:

| Infisical key | Purpose |
| --- | --- |
| `MINIO_ACCESS_KEY` | MinIO observability service account access key |
| `MINIO_SECRET_KEY` | MinIO observability service account secret key |
| `GRAFANA_ADMIN_USER` | Grafana administrator login |
| `GRAFANA_ADMIN_PASSWORD` | Grafana administrator password |

Keep `MINIO_ACCESS_KEY` at 20 characters or fewer to satisfy MinIO's access-key limit.

Create these buckets in MinIO before syncing Loki or Tempo: `loki-chunks`, `loki-ruler`, and `tempo-traces`. Do not use the MinIO root credentials for the stack. The `observability-credentials` Application syncs the InfisicalStaticSecret and creates the Kubernetes Secret consumed by Grafana, Loki, and Tempo. Wait for that Secret to appear before syncing the Helm applications.

After the MinIO Tenant is healthy, sync `minio-observability-access` and wait for its first Job to report `Complete` (`kubectl -n minio get jobs`). This GitOps Application creates the service account and limits it to the three buckets above. Then sync the observability Applications manually in this order:

1. `observability-credentials` (after the Infisical values and MinIO buckets are ready)
2. `kube-prometheus-stack`; wait for it to sync successfully and for the Prometheus Operator CRDs to become established before syncing apps that create ServiceMonitors:

   ```sh
   kubectl wait --for=condition=Established --timeout=120s crd/servicemonitors.monitoring.coreos.com
   ```

3. `loki` and `tempo`
4. `opentelemetry-collector`
5. `kiali` (to apply its Prometheus endpoint setting)

Grafana is included in kube-prometheus-stack; there is no separate Grafana release. Its Loki and Tempo data sources are provisioned automatically. Open Grafana with `kubectl -n observability port-forward svc/kube-prometheus-stack-grafana 3000:80` and sign in with the credentials from Infisical. The Collector accepts OTLP/gRPC on `opentelemetry-collector.observability.svc.cluster.local:4317` and OTLP/HTTP on port `4318`; configure instrumented applications to send there. It sends logs to Loki and traces to Tempo, and exposes received metrics on a Prometheus scrape endpoint. This gateway does not tail every pod's container log or instrument applications automatically; those require an agent or app-side instrumentation.

The chart versions are pinned in their Argo CD Applications: kube-prometheus-stack `93.10.0`, Loki `21.6.0`, Tempo `3.2.1`, and OpenTelemetry Collector `0.178.2`. These are single-node lab deployments, not highly available services. Loki and Tempo each use one core process on `cp`; their PVCs preserve local WAL/state while MinIO stores their long-term blocks.

## Pruning

Child Applications use automated sync, self-heal, prune, `allowEmpty`, and Argo CD's resources finalizer unless called out above. The MinIO Application stays manual until its Infisical secret source is configured. Observability Applications are manual so the MinIO credentials and buckets can be provisioned first and the Prometheus Operator CRDs are ready before related monitors are created. Removing an Application manifest from Git removes the Application and cascades deletion to resources it manages. Removing a resource from an Application source prunes that resource.

## Structure

Keep each component in the existing project/application/values layout:

```text
applications/
├── networking/policies/application.yaml
├── networking/istio/{gateway-api,base,istiod,cni,ztunnel,gateway-placement,kiali}/application.yaml
├── security/cert-manager/application.yaml
├── security/infisical/application.yaml
├── security/infisical-secrets-operator/application.yaml
├── storage/longhorn/application.yaml
├── storage/{minio,minio-observability-access}/application.yaml
└── observability/{observability-credentials,kube-prometheus-stack,loki,tempo,opentelemetry-collector}/application.yaml

projects/
├── networking/networking.yaml
├── service-mesh/service-mesh.yaml
├── security/security.yaml
├── storage/storage.yaml
└── observability/observability.yaml

values/
├── networking/istio/*.yaml and resources/gatewayclass-defaults.yaml
├── security/cert-manager/cert-manager-values.yaml, infisical-pki-issuer-values.yaml, and resources/
├── security/infisical-secrets-operator/values.yaml and resources/
├── storage/minio/operator-values.yaml, tenant-values.yaml, and resources/
├── security/infisical/values.yaml and resources/
├── storage/longhorn/values.yaml and resources/
└── observability/{credentials,kube-prometheus-stack,loki,tempo,opentelemetry-collector}/values.yaml and resources/

policies/
└── cilium-network-policies/kustomization.yaml and policy manifests
```

Helm values and component manifests stay under `values/<project>/<application>/`. AppProjects and child Applications stay under `projects/` and `applications/`. Do not commit secret values as plaintext.
