# VoidLab GitOps

## Current scope

GitOps deploys Cilium network policies, Istio ambient, Longhorn, Infisical, MinIO, cert-manager with Let's Encrypt DNS-01, Headlamp, and the observability stack. Cilium itself remains installed and managed by Pulumi. Pulumi also installs Argo CD and creates the root `voidlab-applications` Application. That root Application reads the AppProject and child Application manifests from this directory, using Argo CD's built-in `default` project. Workload Applications use their dedicated `networking`, `service-mesh`, `storage`, `security`, `observability`, or `platform-tools` project.

The `networking` AppProject is limited to CiliumNetworkPolicy and CiliumClusterwideNetworkPolicy resources. Add policy manifests under `policies/cilium-network-policies/` and list them in its `kustomization.yaml`; Argo CD applies those policies while Pulumi retains ownership of Cilium IPAM and pod networking. No traffic rules are included yet, so this app does not change workload traffic until policies are added.

The Istio stack uses ambient mode and Gateway API. It is kept separate from the narrow Cilium `networking` project under the `service-mesh` AppProject. Istio 1.32.0 and Gateway API v1.6.1 are pinned together because Istio 1.32 lists Gateway API v1.6.1 as its tested version and supports Kubernetes 1.37. The Gateway API CRDs are sourced from the upstream tagged repository, using its `config/crd/experimental` manifests. The Gateway API CRD Application uses server-side apply and does not prune CRDs, since deleting a CRD also deletes every Gateway API object.

The two CNI components have separate roles: Cilium assigns Pod IPs and provides primary pod networking; Istio CNI is chained after Cilium to set up ambient traffic redirection through ztunnel. Istio CNI and ztunnel run as DaemonSets across every node, including `cp`. Cilium remains installed and managed by Pulumi; the added values only configure Cilium to coexist with Istio's chained plugin and redirection.

**Apply the Pulumi Cilium compatibility update before enabling Istio CNI.** This cluster uses Cilium kube-proxy replacement. The Pulumi stack sets `cni.exclusive=false` and `socketLB.hostNamespaceOnly=true` for Istio chaining and redirection, and explicitly leaves `bpf.masquerade=false` for ambient health-probe compatibility. Confirm that Pulumi update is applied before the automatic `istio-cni` sync. Do not enroll workloads before both node DaemonSets are healthy. [Cilium's Istio integration guide](https://docs.cilium.io/en/latest/network/servicemesh/istio/) [Istio's Cilium prerequisites](https://istio.io/latest/docs/ambient/install/platform-prerequisites/)

The Istio controller, Kiali, the public Gateway, and Headlamp are pinned to `cp` and tolerate the control-plane taint. The shared `public` Gateway uses class `istio`, terminates HTTPS with the wildcard Let's Encrypt certificate, and redirects HTTP to HTTPS. Its listeners accept routes for `*.kiroku.life`. Add a Cloudflare DNS record for `*.kiroku.life` pointing to the public Gateway address after the cluster load-balancer and router forwarding are configured. Istiod creates a waypoint when you add a Gateway API `Gateway` using class `istio-waypoint`; no waypoint is created until a namespace or service needs L7 processing. The `minio`, `observability`, and `headlamp` namespaces are enrolled through their Argo CD Applications, and Kiali's server pod is enrolled individually. Because Argo automatically syncs these labels, verify Istio CNI and ztunnel are healthy on every node before pushing a change that enables enrollment.

Kiali uses the Prometheus service over HTTP inside ambient mTLS for graph metrics and metric-based health views. Kiali uses its default token authentication and stays internal; use `kubectl -n istio-system port-forward svc/kiali 20001:20001` to open the UI. Headlamp chart `0.46.0` is available at `https://headlamp.kiroku.life` after the Gateway has a reachable LoadBalancer address and the public DNS record points to it. Headlamp uses per-user bearer-token login; its own service account is restricted to the built-in `view` role. Do not enable shared service-account authentication for a public deployment.

All Istio child Applications automatically sync. Their retry policy allows components to converge as prerequisite CRDs and controllers become available. The Cilium compatibility update must already be applied before `istio-cni` can work correctly.

Before syncing the ambient labels, verify with `kubectl get ds -n istio-system` and `kubectl get pods -n istio-system -o wide`; there should be one ready Istio CNI and one ready ztunnel pod on each node. Also check `kubectl get gatewayclass`. Use a matching Istio 1.32 `istioctl` for diagnostics. Istio ambient mTLS provides encryption and workload identity between enrolled pods; applications use HTTP on in-mesh links.

Longhorn and MinIO use the `storage` AppProject. One MinIO Application manages both the MinIO Operator and Tenant charts in the `minio` namespace. The tenant runs as a single server on `cp`, tolerates the control-plane taint, and requests a 1 TiB volume from a dedicated Longhorn StorageClass with two replicas and `WaitForFirstConsumer` (about 2 TiB of raw Longhorn capacity).

The Infisical Kubernetes Secrets Operator is a shared add-on under the `security` project; its `InfisicalConnection` and `InfisicalAuth` are reusable by MinIO and future applications. Create a read-only Universal Auth machine identity in the Infisical UI, then create `security/infisical-universal-auth` in Kubernetes with its `clientId` and `clientSecret`. Keep those credentials out of Git. Each application adds only its own `InfisicalStaticSecret` resource and references `infisical-shared` in the `security` namespace. The existing Infisical server release is unchanged.

The `cert-manager` Application installs cert-manager in the `cert-manager` namespace. A separate `letsencrypt` Application creates staging and production Cloudflare DNS-01 `ClusterIssuer` resources and a wildcard certificate for `kiroku.life` and `*.kiroku.life`, stored in `istio-system` for the Gateway. Add `CLOUDFLARE_DNS_API_TOKEN` to the `voidlab` Infisical project, environment `prod`, path `/cert-manager`. Use a Cloudflare API Token scoped to the `kiroku.life` zone with `Zone - DNS - Edit` and `Zone - Zone - Read`; the token is synchronized to the `cert-manager` namespace and never stored in Git. The ACME account email is `snharish85@gmail.com`. cert-manager's CRDs are enabled and retained. The chart is pinned to `v1.21.3`; it is scheduled on `cp` and tolerates the control-plane taint. Upstream lists cert-manager 1.21 as supporting Kubernetes only through 1.36, while this cluster reports 1.37.2, so verify compatibility before relying on cert-manager for public certificates or upgrading it.

MinIO's `InfisicalStaticSecret` reads project ID `60e9131c-3eef-403a-b2b1-94c393caf930` (project name `voidlab`), environment `prod`, path `/minio`, and writes `minio-env-configuration`. No CA certificate is needed in that path for internal MinIO traffic: auto-TLS is disabled, so MinIO serves HTTP on the Tenant Service's port 80 while Istio ambient mTLS protects in-mesh traffic. The shared public Gateway terminates external HTTPS with the wildcard Let's Encrypt certificate.

The `minio-observability-access` Application automatically provisions the Loki/Tempo service account from the Infisical keys at `/observability`. It creates a MinIO service account with an inline policy limited to `loki-chunks`, `loki-ruler`, and `tempo-traces`; a CronJob reapplies credentials and policy every ten minutes so Infisical rotations are reconciled. The same Infisical credentials are synced into the `observability` namespace for Loki and Tempo.

MinIO's community Operator and Tenant charts are pinned at `7.1.1`; the community repositories were archived in 2026. The Tenant uses Chainguard's public MinIO image (`docker.io/chainguard/minio:latest`) because anonymous pulls from MinIO's old Quay image now fail. Its pool security context matches the image's non-root UID/GID 65532. The `latest` tag follows Chainguard's current build on each pod start. The tenant is configured as a single server and is not a distributed or highly available MinIO deployment.

Infisical uses the official `infisical-standalone` chart with its bundled PostgreSQL and Redis dependencies enabled. These are part of the Infisical Application, not separate platform apps. Infisical, PostgreSQL, and Redis are pinned to `cp`; their persistent data uses Longhorn. Kubernetes Ingress and the chart's bundled ingress controller are disabled; use `kubectl -n security port-forward svc/infisical-infisical-standalone-infisical 8082:8080` and open `http://localhost:8082` for initial setup. Public tool routes use Gateway API HTTPRoutes attached to Istio's `public` Gateway.

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

The `observability` AppProject installs kube-prometheus-stack, Loki, Tempo, and an OpenTelemetry Collector gateway in the `observability` namespace. kube-prometheus-stack supplies Prometheus, Grafana, Alertmanager, kube-state-metrics, and node-exporter. Prometheus, Grafana, Alertmanager, kube-state-metrics, Loki, Tempo, and the Collector are pinned to `cp` and tolerate its control-plane taint. Node-exporter remains a DaemonSet on both `cp` and `worker` so Prometheus gets host metrics from each node. Prometheus, Grafana, Loki, and Tempo use Longhorn PVCs. The namespace uses Istio ambient mTLS for in-mesh traffic; Grafana, Loki, Tempo, the Collector, Prometheus, MinIO, and Kiali use HTTP at the application layer. Loki and Tempo store log and trace blocks in MinIO over HTTP inside the mesh. Prometheus continues to trust the Kubernetes CA for Kubernetes endpoint scrapes.

Add these four secrets to the `voidlab` Infisical project (`60e9131c-3eef-403a-b2b1-94c393caf930`), environment `prod`, path `/observability`:

| Infisical key | Purpose |
| --- | --- |
| `MINIO_ACCESS_KEY` | MinIO observability service account access key |
| `MINIO_SECRET_KEY` | MinIO observability service account secret key |
| `GRAFANA_ADMIN_USER` | Grafana administrator login |
| `GRAFANA_ADMIN_PASSWORD` | Grafana administrator password |

Keep `MINIO_ACCESS_KEY` at 20 characters or fewer to satisfy MinIO's access-key limit.

Create these buckets in MinIO before Loki or Tempo use them: `loki-chunks`, `loki-ruler`, and `tempo-traces`. Do not use MinIO root credentials for the stack. Once the four Infisical values and buckets are ready, Argo automatically syncs the credentials, MinIO access provisioner, kube-prometheus-stack, Loki, Tempo, the Collector, and Kiali. The chart Applications retry failed syncs while dependencies such as the Prometheus Operator ServiceMonitor CRD become available. Check the first service-account Job with `kubectl -n minio get jobs`; Loki and Tempo need that Job to complete successfully before MinIO accepts their credentials.

Grafana is included in kube-prometheus-stack; there is no separate Grafana release. Its Prometheus, Loki, and Tempo data sources are provisioned automatically. Open Grafana with `kubectl -n observability port-forward svc/kube-prometheus-stack-grafana 3000:80` and sign in with the credentials from Infisical. The Collector accepts OTLP/gRPC on `opentelemetry-collector.observability.svc.cluster.local:4317` and OTLP/HTTP on port `4318`; Istio ambient mTLS encrypts in-mesh traffic. It sends logs to Loki and traces to Tempo inside the mesh and exposes received metrics for Prometheus to scrape. This gateway does not tail every pod's container log or instrument applications automatically; those require an agent or app-side instrumentation.

The chart versions are pinned in their Argo CD Applications: kube-prometheus-stack `93.10.0`, Loki `21.6.0`, Tempo `3.2.1`, and OpenTelemetry Collector `0.178.2`. These are single-node lab deployments, not highly available services. Loki and Tempo each use one core process on `cp`; their PVCs preserve local WAL/state while MinIO stores their long-term blocks.

## Pruning

The MinIO, MinIO access provisioner, observability, cert-manager, Let's Encrypt, Headlamp, public Gateway, and Kiali Applications use automated sync, self-heal, retry, and Argo CD's resources finalizer. MinIO leaves pruning disabled to protect its stateful tenant resources. Other included Applications prune resources removed from their source; `allowEmpty` is enabled only where explicitly listed. Removing an Application manifest from Git removes that Application and cascades deletion to resources it manages. Removing a resource from an Application source prunes that resource when pruning is enabled.

## Structure

Keep each component in the existing project/application/values layout:

```text
applications/
├── networking/policies/application.yaml
├── networking/istio/{gateway-api,base,istiod,cni,ztunnel,gateway-placement,kiali,public-gateway}/application.yaml
├── security/{cert-manager,letsencrypt}/application.yaml
├── security/infisical/application.yaml
├── security/infisical-secrets-operator/application.yaml
├── storage/longhorn/application.yaml
├── storage/{minio,minio-observability-access}/application.yaml
├── platform/headlamp/application.yaml
└── observability/{observability-credentials,kube-prometheus-stack,loki,tempo,opentelemetry-collector}/application.yaml

projects/
├── networking/networking.yaml
├── service-mesh/service-mesh.yaml
├── security/security.yaml
├── platform-tools/platform-tools.yaml
├── storage/storage.yaml
└── observability/observability.yaml

values/
├── networking/istio/*.yaml and resources/gatewayclass-defaults.yaml
├── networking/istio/public-gateway/gateway.yaml
├── security/cert-manager/cert-manager-values.yaml
├── security/letsencrypt/resources/acme.yaml
├── security/infisical-secrets-operator/values.yaml and resources/
├── storage/minio/operator-values.yaml, tenant-values.yaml, and resources/
├── security/infisical/values.yaml and resources/
├── storage/longhorn/values.yaml and resources/
├── platform/headlamp/values.yaml
└── observability/{credentials,kube-prometheus-stack,loki,tempo,opentelemetry-collector}/values.yaml and resources/

policies/
└── cilium-network-policies/kustomization.yaml and policy manifests
```

Helm values and component manifests stay under `values/<project>/<application>/`. AppProjects and child Applications stay under `projects/` and `applications/`. Do not commit secret values as plaintext.
