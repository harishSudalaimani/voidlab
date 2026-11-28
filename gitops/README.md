# VoidLab GitOps

## Current scope

GitOps deploys Cilium network policies, Istio ambient, Longhorn, Infisical, MinIO, cert-manager with Let's Encrypt DNS-01, Headlamp, the observability stack, Harbor, OpenCost, OpenFGA, CloudNativePG, standalone Redis, RedisInsight, Argo Rollouts, Keycloak, Kyverno, Policy Reporter, Backstage, Technitium DNS, ExternalDNS, CoreDNS forwarding, and the Cloudflare Tunnel connector. Keycloak SSO protects the Rollouts, OpenCost, Hubble, Kiali, and Longhorn dashboards through OAuth2 Proxy; Grafana, Harbor, and Technitium use native OIDC. Cilium itself remains installed and managed by Pulumi. Pulumi also installs Argo CD and creates the root `voidlab-applications` Application. That root Application reads the AppProject and child Application manifests from this directory, using Argo CD's built-in `default` project. Workload Applications use their dedicated `networking`, `service-mesh`, `storage`, `security`, `observability`, `database`, `platform`, or `dns` project.

The `networking` AppProject allows Cilium network policies, LB IP pools, and L2 announcement policies. Manifests under `policies/cilium/network-policies/` are applied by Argo CD; Pulumi retains ownership of the Cilium installation. The public Istio Gateway uses `192.168.29.254/32`, while Technitium DNS uses a separate `192.168.29.253/32` pool. Each pool selects only its matching Service. Their L2 announcements are restricted to the control-plane node's `enp8s0` interface.

## Availability

The target topology is one Kubernetes node: every workload runs on `cp`. Important stateless services keep two replicas to tolerate a pod restart, while database replicas and topology rules use preferred placement so they can co-locate on this node. CloudNativePG clusters remain primary/standby pairs. This does not protect against loss of `cp` or its disks; the single-node target has one compute and storage failure domain.

The `.253` DNS VIP and `.254` Gateway VIP, Kubernetes API, Cilium, and Argo CD all depend on `cp`. If that server is unreachable, the cluster and both LAN entry points are unavailable, including services with two pods.

Several important stateful services are still single-instance because their data paths need an HA design before their pods can be duplicated safely: Technitium has one StatefulSet/PVC and its v14+ native cluster has not been configured; Infisical's two app replicas still share its bundled single PostgreSQL and standalone Redis; Grafana uses SQLite on one RWO volume; and Harbor still uses its bundled single Redis. Standalone Redis, Prometheus, Loki, and Tempo also remain single-instance. CNPG streaming replication is not a backup, and no backups are configured for those database clusters yet.

Gateway API configuration is organized under `gateway-api/`. `gateway/public/` holds the Gateway listeners. Every `HTTPRoute` has a small Kustomize module in `routes/<module>/`, so the full route inventory is easy to review in one place. Each application keeps ownership of its own route by including that route module as an Argo CD source; the public Gateway Application owns the shared redirects. The top-level `routes/kustomization.yaml` is an audit/build inventory only and is not an Argo CD source.

Before syncing either VIP, keep the router DHCP range at `192.168.29.2–192.168.29.199` so it cannot lease `.253` or `.254`. Cilium's Pulumi Helm release enables `l2announcements.enabled=true` and already has `kubeProxyReplacement=true`. Cilium auto-detects devices because the node interfaces have different names; verify `enp8s0` is selected on `cp` before relying on the Gateway VIP. Apply the Cilium Pulumi update before the networking-policies Application syncs the announcement policy.

The Cloudflare Tunnel connector runs two replicas on `cp` and uses a remotely managed tunnel token synchronized from Infisical. In Cloudflare, protect both `kiroku.life` and `*.kiroku.life` with Access allow policies for your account; the wildcard does not include the apex. Use an identity provider that does not depend only on Keycloak. Add two published application routes to `https://public-istio.istio-system.svc.cluster.local:443`: leave Subdomain empty for `kiroku.life`, and use `*` for tool hostnames under `*.kiroku.life`. Keep origin TLS verification enabled and turn on **Match SNI to Host** on both routes. The apex route will work after an HTTPRoute for the root application is added to GitOps. Ensure the apex DNS record and wildcard DNS record are proxied and point to the Tunnel; the route wizard can create them. Remove or update exact public DNS records that conflict with the wildcard. Add the tunnel token to Infisical at `/cloudflare-tunnel` as `CLOUDFLARE_TUNNEL_TOKEN`. The connector initiates outbound connections; public requests do not need a WAN port forward or wider host firewall rule. At home, Technitium resolves names directly to `.254`, bypassing Cloudflare Access; the LAN path remains protected by trusted-LAN firewall scope and each application's own login where provided.

Argo CD's `argocd-auth` Application manages `argocd-cm`, `argocd-rbac-cm`, and the InfisicalStaticSecret for its Keycloak OIDC client. The client secret is read from `/argocd/ARGOCD_OIDC_CLIENT_SECRET` and synchronized to `argocd-oidc-secret`; only the reference to that Secret is stored in the OIDC ConfigMap. Argo CD requests the standard `openid`, `profile`, and `email` scopes; it reads the Keycloak `groups` claim separately for RBAC. Keycloak group claims `argocd-admins` and `/argocd-admins` map to `role:admin`, while other authenticated users receive read-only access. The OIDC configuration includes the ISRG Root X1 CA because the current Keycloak endpoint certificate chain is not trusted by Argo CD's runtime. These ConfigMaps are also rendered by the Pulumi-installed Helm release, so review this GitOps configuration if you change the Argo CD chart or values through Pulumi.

The Istio stack uses ambient mode and Gateway API. It is kept separate from the narrow Cilium `networking` project under the `service-mesh` AppProject. Istio 1.32.0 and Gateway API v1.6.1 are pinned together because Istio 1.32 lists Gateway API v1.6.1 as its tested version and supports Kubernetes 1.37. The Gateway API CRDs are sourced from the upstream tagged repository, using its `config/crd/experimental` manifests. The Gateway API CRD Application uses server-side apply and does not prune CRDs, since deleting a CRD also deletes every Gateway API object.

DNS follows the route-driven design: Gateway API `HTTPRoute` hostnames are the desired names, ExternalDNS watches only the `gateway-httproute` source and writes private records to Technitium through its webhook API, and the existing kubeadm CoreDNS service forwards cluster queries to Technitium. Technitium forwards public lookups to `1.1.1.1` and `9.9.9.9` and is the internal authority for the `kiroku.life` zone. At home, configure the router's DHCP DNS server to `192.168.29.253`; Technitium's Cilium LoadBalancer Service answers on that dedicated L2 VIP, while application host records resolve to the Istio Gateway at `192.168.29.254`. Technitium's UI is at `https://technitium.kiroku.life` (also available as `https://dns.kiroku.life`); Technitium and ExternalDNS run on `cp` with the control-plane toleration. cert-manager checks DNS-01 challenge records through public recursive resolvers because the private Technitium zone does not contain Cloudflare's public challenge records.

Before ExternalDNS can publish records, connect to the Technitium UI on first install with `kubectl -n dns port-forward svc/technitium 5380:5380` and open `http://localhost:5380`. Create the primary `kiroku.life` zone, then create an API token for a dedicated DNS automation user with permission to manage records in that zone. Store the admin password and API token in Infisical as described below. The webhook image currently uses the upstream `latest` tag because its README still shows a placeholder version; pin a published image tag when the project releases one. CoreDNS's existing `kube-system/coredns` ConfigMap is adopted by the `coredns-forwarding` Application. Compare it with the live ConfigMap before syncing and preserve any local Corefile customizations; this manifest manages the entire Corefile and uses the kubeadm default plugin chain.

The two CNI components have separate roles: Cilium assigns Pod IPs and provides primary pod networking; Istio CNI is chained after Cilium to set up ambient traffic redirection through ztunnel. Istio CNI and ztunnel run as DaemonSets across every node, including `cp`. Cilium remains installed and managed by Pulumi; the added values only configure Cilium to coexist with Istio's chained plugin and redirection.

**Apply the Pulumi Cilium compatibility update before enabling Istio CNI.** This cluster uses Cilium kube-proxy replacement. The Pulumi stack sets `cni.exclusive=false` and `socketLB.hostNamespaceOnly=true` for Istio chaining and redirection, and explicitly leaves `bpf.masquerade=false` for ambient health-probe compatibility. Confirm that Pulumi update is applied before the automatic `istio-cni` sync. Do not enroll workloads before both node DaemonSets are healthy. [Cilium's Istio integration guide](https://docs.cilium.io/en/latest/network/servicemesh/istio/) [Istio's Cilium prerequisites](https://istio.io/latest/docs/ambient/install/platform-prerequisites/)

Istiod has two replicas with preferred anti-affinity. The Kiali operator remains pinned to `cp`, while its server has two replicas; the public `Gateway` uses soft topology spreading, and Headlamp has two replicas. All run on `cp` in this single-node target. The shared `public` Gateway uses class `istio`, terminates HTTPS with the wildcard Let's Encrypt certificate, and redirects HTTP to HTTPS. Its listeners accept the apex hostname `kiroku.life` and tool hostnames under `*.kiroku.life`. The host firewall restricts direct Gateway and DNS access to the configured LAN CIDR; Cloudflare Tunnel uses the in-cluster Gateway Service for public requests. Istiod creates a waypoint when you add a Gateway API `Gateway` using class `istio-waypoint`; no waypoint is created until a namespace or service needs L7 processing. The `minio`, `observability`, and `headlamp` namespaces are enrolled through their Argo CD Applications, and Kiali's server pod is enrolled individually. Verify Istio CNI and ztunnel are healthy on `cp` before pushing a change that enables enrollment.

GUI routes use `HTTPRoute` hostnames, and ExternalDNS publishes private records to Technitium's `kiroku.life` zone with the Gateway VIP as the target. The same dashboard URLs work on the LAN and through Cloudflare Tunnel outside the home. Cloudflare Access protects the public wildcard route; the direct LAN route bypasses Access. The Gateway host firewall blocks direct WAN connections. The dashboards are available at `argocd`, `alertmanager`, `backstage`, `dns`, `grafana`, `harbor`, `headlamp`, `hubble`, `infisical`, `kiali`, `keycloak`, `longhorn`, `minio`, `opencost`, `policy-reporter`, `prometheus`, `redisinsight`, `rollouts`, and `technitium` under `kiroku.life`.

Argo CD is exposed at `https://argocd.kiroku.life` over its existing TLS service port. A cert-manager `Certificate` supplies the `argocd-server-tls` Secret, and Gateway API `BackendTLSPolicy` validates the upstream certificate against system roots. Argo CD hot-reloads this certificate when cert-manager renews it.

Kiali uses the Prometheus service over HTTP inside ambient mTLS for graph metrics and metric-based health views. Two Kiali server replicas and two OAuth2 Proxy replicas serve `https://kiali.kiroku.life`, restricted to Keycloak group `argocd-admins`; the Gateway route targets the proxy. Kiali's own auth strategy is set to anonymous because the proxy handles login at the published route, so do not publish the Kiali Service directly. Kiali's operator-managed NetworkPolicy allows its application and metrics ports; the separate `policies/istio/kiali` policy also permits ambient HBONE on port `15008`, which Istio requires for ambient traffic. Hubble UI uses the same Keycloak group gate at `https://hubble.kiroku.life`. Headlamp chart `0.46.0` has two replicas at `https://headlamp.kiroku.life`; it uses per-user bearer-token login and its own service account is restricted to the built-in `view` role. Do not enable shared service-account authentication for a public deployment.

All Istio child Applications automatically sync. Their retry policy allows components to converge as prerequisite CRDs and controllers become available. The Cilium compatibility update must already be applied before `istio-cni` can work correctly.

Before syncing the ambient labels, verify with `kubectl get ds -n istio-system` and `kubectl get pods -n istio-system -o wide`; there should be one ready Istio CNI and one ready ztunnel pod on `cp`. Also check `kubectl get gatewayclass`. Use a matching Istio 1.32 `istioctl` for diagnostics. Istio ambient mTLS provides encryption and workload identity between enrolled pods; applications use HTTP on in-mesh links.

Longhorn and MinIO use the `storage` AppProject. One MinIO Application manages both the MinIO Operator and Tenant charts in the `minio` namespace. The tenant runs as a single server on `cp`, tolerates the control-plane taint, and requests a 1 TiB volume from `longhorn-minio-single` with one replica and `WaitForFirstConsumer` (about 1 TiB of raw Longhorn capacity).

The Infisical application now has two replicas, but its bundled PostgreSQL and Redis are still single instances and remain service dependencies. The Infisical Kubernetes Secrets Operator is a shared add-on under the `security` project; its `InfisicalConnection` and `InfisicalAuth` are reusable by MinIO and future applications. Create a read-only Universal Auth machine identity in the Infisical UI, then create `security/infisical-universal-auth` in Kubernetes with its `clientId` and `clientSecret`. Keep those credentials out of Git. Each application adds only its own `InfisicalStaticSecret` resource and references `infisical-shared` in the `security` namespace.

The `cert-manager` Application installs cert-manager in the `cert-manager` namespace. A separate `letsencrypt` Application creates staging and production Cloudflare DNS-01 `ClusterIssuer` resources and a wildcard certificate for `kiroku.life` and `*.kiroku.life`, stored in `istio-system` for the Gateway. Add `CLOUDFLARE_DNS_API_TOKEN` to the `voidlab` Infisical project, environment `prod`, path `/cert-manager`. Use a Cloudflare API Token scoped to the `kiroku.life` zone with `Zone - DNS - Edit` and `Zone - Zone - Read`; the token is synchronized to the `cert-manager` namespace and never stored in Git. The ACME account email is `snharish85@gmail.com`. cert-manager's CRDs are enabled and retained. The chart is pinned to `v1.21.3`; it is scheduled on `cp` and tolerates the control-plane taint. Upstream lists cert-manager 1.21 as supporting Kubernetes only through 1.36, while this cluster reports 1.37.2, so verify compatibility before relying on cert-manager for public certificates or upgrading it.

MinIO's `InfisicalStaticSecret` reads project ID `60e9131c-3eef-403a-b2b1-94c393caf930` (project name `voidlab`), environment `prod`, path `/minio`, and writes `minio-env-configuration`. No CA certificate is needed in that path for internal MinIO traffic: auto-TLS is disabled, so MinIO serves HTTP on the Tenant Service's port 80 while Istio ambient mTLS protects in-mesh traffic. The shared public Gateway terminates external HTTPS with the wildcard Let's Encrypt certificate.

The `minio-observability-access` Application automatically provisions the Loki/Tempo service account from the Infisical keys at `/observability`. It creates a MinIO service account with an inline policy limited to `loki-chunks`, `loki-ruler`, and `tempo-traces`; a CronJob reapplies credentials and policy every two minutes so Infisical rotations are reconciled promptly. The same Infisical credentials are synced into the `observability` namespace for Loki and Tempo. A separate `minio-harbor-access` Application creates the `harbor` bucket and a Harbor-only service account from `/harbor`; its policy is scoped to that bucket and its objects.

MinIO's community Operator and Tenant charts are pinned at `7.1.1`; the community repositories were archived in 2026. The Tenant uses Chainguard's public MinIO image (`docker.io/chainguard/minio:latest`) because anonymous pulls from MinIO's old Quay image now fail. Its pool security context matches the image's non-root UID/GID 65532. The `latest` tag follows Chainguard's current build on each pod start. The tenant is configured as a single server and is not a distributed or highly available MinIO deployment.

Infisical uses the official `infisical-standalone` chart with its bundled PostgreSQL and Redis dependencies enabled. These remain part of the Infisical Application in the `security` project, not separate platform apps. Infisical, PostgreSQL, and Redis are pinned to `cp`; their persistent data uses Longhorn. Kubernetes Ingress and the chart's bundled ingress controller are disabled; open `https://infisical.kiroku.life` for setup. The chart sets `SITE_URL` to that HTTPS URL. Tool routes use Gateway API HTTPRoutes attached to Istio's `public` Gateway.

### Infisical bootstrap secret

Run this once after the `security` namespace exists. It creates only the bootstrap Secret Infisical needs to start; do not commit its values:

```sh
kubectl -n security create secret generic infisical-secrets \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=ENCRYPTION_KEY="$(openssl rand -hex 16)" \
  --from-literal=SITE_URL="https://infisical.kiroku.life"
```

The Infisical chart already references `infisical-secrets`. After this Secret is created, the pod should start; later application credentials belong in Infisical.

Longhorn control components and storage workloads run on `cp`. The default StorageClass and Longhorn default volume settings use one replica because only one node remains.

Longhorn stores data on `cp`'s `/data/vms/longhorn` SSD and `/storage/longhorn` HDD mounts. Disk scheduling keeps a 15% free-space threshold, but this is not a hard cap for snapshot growth or volume writes, so monitor disk usage and leave host space available. A single Longhorn replica provides no disk or node redundancy. The Longhorn Node annotation configures disks when Longhorn first discovers a node; it does not rewrite disks already present in Longhorn's Node resources. The default replica count applies to new volumes only. For existing volumes, set the desired replica count to one, verify a healthy replica on `cp`, then remove any stale Longhorn node resource after it has no replicas or attached volumes. Do not delete a PVC just to remove one node's replica; deleting the claim can delete the whole volume.

The bundled PostgreSQL and Redis instances are single-instance proof-of-concept dependencies, not HA services. Harbor also retains its chart-bundled Redis. Redis stays managed by each parent Helm Application; it is not a standalone resource in the `database` project. Add other shared data services or application workloads later as separate GitOps Applications after this phase is confirmed healthy.

## Observability

The `observability` AppProject installs kube-prometheus-stack, Loki, Tempo, and an OpenTelemetry Collector gateway in the `observability` namespace. kube-prometheus-stack supplies Prometheus, Grafana, Alertmanager, kube-state-metrics, and node-exporter. Prometheus, Grafana, Alertmanager, kube-state-metrics, Loki, Tempo, the Collector, and node-exporter all run on `cp`; node-exporter has one pod because it is a DaemonSet on the only node. Prometheus, Grafana, Loki, and Tempo use Longhorn PVCs. The namespace uses Istio ambient mTLS for in-mesh traffic; Grafana, Loki, Tempo, the Collector, Prometheus, MinIO, and Kiali use HTTP at the application layer. Loki and Tempo store log and trace blocks in MinIO over HTTP inside the mesh. Prometheus continues to trust the Kubernetes CA for Kubernetes endpoint scrapes.

Add these four secrets to the `voidlab` Infisical project (`60e9131c-3eef-403a-b2b1-94c393caf930`), environment `prod`, path `/observability`:

| Infisical key | Purpose |
| --- | --- |
| `MINIO_ACCESS_KEY` | MinIO observability service account access key |
| `MINIO_SECRET_KEY` | MinIO observability service account secret key |
| `GRAFANA_ADMIN_USER` | Grafana administrator login |
| `GRAFANA_ADMIN_PASSWORD` | Grafana administrator password |

Keep `MINIO_ACCESS_KEY` at 20 characters or fewer to satisfy MinIO's access-key limit.


Create these buckets in MinIO before Loki or Tempo use them: `loki-chunks`, `loki-ruler`, and `tempo-traces`. Do not use MinIO root credentials for the stack. Once the four Infisical values and buckets are ready, Argo automatically syncs the credentials, MinIO access provisioner, kube-prometheus-stack, Loki, Tempo, the Collector, and Kiali. The chart Applications retry failed syncs while dependencies such as the Prometheus Operator ServiceMonitor CRD become available. Check the first service-account Job with `kubectl -n minio get jobs`; Loki and Tempo need that Job to complete successfully before MinIO accepts their credentials.

Grafana is included in kube-prometheus-stack; there is no separate Grafana release. It currently uses SQLite on a single RWO volume, so keep one Grafana replica until a shared database is configured. Its Prometheus, Loki, and Tempo data sources are provisioned automatically. Grafana supports Keycloak sign-in at `https://grafana.kiroku.life`; Keycloak members of `argocd-admins` receive Grafana server-admin rights and other realm users receive Viewer. The local Grafana admin login remains enabled for break-glass access. Prometheus and Alertmanager are available at `https://prometheus.kiroku.life` and `https://alertmanager.kiroku.life`. The Collector accepts OTLP/gRPC on `opentelemetry-collector.observability.svc.cluster.local:4317` and OTLP/HTTP on port `4318`; Istio ambient mTLS encrypts in-mesh traffic. It sends logs to Loki and traces to Tempo inside the mesh and exposes received metrics for Prometheus to scrape. This gateway does not tail every pod's container log or instrument applications automatically; those require an agent or app-side instrumentation.

The chart versions are pinned in their Argo CD Applications: kube-prometheus-stack `93.10.0`, Loki `21.6.0`, Tempo `3.2.1`, and OpenTelemetry Collector `0.178.2`. These remain single-instance lab services, not highly available services. Prometheus, Loki, and Tempo each use one core process on `cp`; their PVCs preserve local WAL/state while MinIO stores their long-term blocks.

## Database and platform projects

The `database` AppProject installs two CloudNativePG operator replicas in `cnpg-system`, standalone Redis, and RedisInsight in the `database` namespace. The operator namespace is not ambient-enrolled so its Kubernetes admission webhook remains on its normal control-plane TLS path; the database namespace is ambient-enrolled for Istio mTLS. The Redis StatefulSet is pinned to `cp`, uses an 8 GiB Longhorn PVC, append-only persistence, and a password from Infisical. Its in-cluster endpoint is `redis.database.svc.cluster.local:6379`. It is a single instance with no failover or backup configuration, so configure and verify backups before relying on it for irreplaceable data. Redis uses `noeviction`; clients receive write errors when its 512 MiB data limit is full. RedisInsight is pinned to `cp`, stores its local data on Longhorn, and is preconfigured for the standalone Redis service. Its UI is at `https://redisinsight.kiroku.life`; it has no built-in UI login and is reachable only through the LAN-restricted Gateway. Redis remains bundled with Harbor and Infisical as well; their chart resources stay in their parent Applications' projects and are separate from this standalone instance.

Longhorn's dashboard has two UI replicas and two OAuth2 Proxy replicas at `https://longhorn.kiroku.life`, behind Keycloak group `argocd-admins`. MinIO's Console is available at `https://minio.kiroku.life`; the S3 API stays in-cluster only. The Console's `MINIO_BROWSER_REDIRECT_URL` is set to the Console hostname.

The working Headlamp deployment includes the official CloudNativePG plugin. Open Headlamp at `https://headlamp.kiroku.life` and select the CloudNativePG section. Its service account receives read-only access to CloudNativePG custom resources. Headlamp users authenticate with their own Kubernetes credentials, so the actions available to each user follow their own Kubernetes RBAC.

Harbor stores registry images and charts in the MinIO `harbor` bucket, using its bucket-scoped service account. Harbor's PostgreSQL credentials and chart secrets come from Infisical path `/harbor`. Harbor is reachable at `https://harbor.kiroku.life` through an Istio Gateway API `HTTPRoute`; configure Harbor's native OIDC provider in its admin UI after syncing, as detailed below. Keep the local Harbor admin login for break-glass access. The public Gateway terminates Let's Encrypt TLS and ambient mTLS protects in-cluster service traffic. Its database and MinIO endpoints use HTTP/PostgreSQL TLS disabled at the application layer because the Harbor namespace is enrolled in ambient mode. Harbor keeps Trivy and job logs on Longhorn PVCs.

OpenCost runs two exporter replicas on `cp` and queries `kube-prometheus-stack-prometheus.observability.svc.cluster.local:9090` over HTTP inside ambient mTLS; it registers a ServiceMonitor with the label selected by the existing Prometheus instance. Its UI/API is at `https://opencost.kiroku.life` behind two OAuth2 Proxy replicas, restricted to Keycloak group `argocd-admins`.

OpenFGA uses its PostgreSQL cluster, requires a pre-shared API key from Infisical path `/openfga`, and disables the development Playground. It stays internal with no public HTTPRoute. In-cluster clients use `openfga.openfga.svc.cluster.local:8080` for HTTP or port `8081` for gRPC; ambient mTLS encrypts service-to-service traffic. The OpenFGA chart also creates a ServiceMonitor for Prometheus.

Add these values to the `voidlab` Infisical project (`60e9131c-3eef-403a-b2b1-94c393caf930`), environment `prod`:

| Path | Infisical key | Purpose / format |
| --- | --- | --- |
| `/harbor` | `HARBOR_ADMIN_PASSWORD` | Initial Harbor admin password |
| `/harbor` | `HARBOR_SECRET_KEY` | Exactly 16 characters |
| `/harbor` | `HARBOR_CORE_SECRET` | Exactly 16 characters |
| `/harbor` | `HARBOR_CSRF_KEY` | Exactly 32 characters |
| `/harbor` | `HARBOR_JOBSERVICE_SECRET` | Exactly 16 characters |
| `/harbor` | `HARBOR_REGISTRY_HTTP_SECRET` | Exactly 16 characters |
| `/harbor` | `HARBOR_REGISTRY_PASSWORD` | Password matching the registry htpasswd entry |
| `/harbor` | `HARBOR_REGISTRY_HTPASSWD` | Bcrypt htpasswd line for `harbor_registry_user` |
| `/harbor` | `HARBOR_BACKSTAGE_PULL_USERNAME` | Harbor project robot username with pull access to `library` |
| `/harbor` | `HARBOR_BACKSTAGE_PULL_SECRET` | Token/password for the Backstage image pull robot |
| `/harbor` | `HARBOR_MINIO_ACCESS_KEY` | MinIO service-account key; keep it at 20 characters or fewer |
| `/harbor` | `HARBOR_MINIO_SECRET_KEY` | MinIO service-account secret key |
| `/harbor` | `HARBOR_DATABASE_USERNAME` | Set to `harbor` |
| `/harbor` | `HARBOR_DATABASE_PASSWORD` | PostgreSQL password for Harbor |
| `/harbor` | `HARBOR_KEYCLOAK_CLIENT_SECRET` | Confidential secret for Harbor's `harbor` OIDC client |
| `/grafana` | `GRAFANA_KEYCLOAK_CLIENT_SECRET` | Confidential secret for Grafana's `grafana` OIDC client |
| `/opencost` | `OPENCOST_OIDC_CLIENT_SECRET` | Secret for the `opencost` OAuth2 Proxy client |
| `/opencost` | `OPENCOST_OAUTH2_PROXY_COOKIE_SECRET` | Base64-encoded random 32-byte cookie secret; generate with `openssl rand -base64 32` |
| `/hubble` | `HUBBLE_OIDC_CLIENT_SECRET` | Secret for the `hubble` OAuth2 Proxy client |
| `/hubble` | `HUBBLE_OAUTH2_PROXY_COOKIE_SECRET` | Base64-encoded random 32-byte cookie secret; generate with `openssl rand -base64 32` |
| `/kiali` | `KIALI_OIDC_CLIENT_SECRET` | Secret for the `kiali-ui` OAuth2 Proxy client |
| `/kiali` | `KIALI_OAUTH2_PROXY_COOKIE_SECRET` | Base64-encoded random 32-byte cookie secret; generate with `openssl rand -base64 32` |
| `/longhorn` | `LONGHORN_OIDC_CLIENT_SECRET` | Secret for the `longhorn` OAuth2 Proxy client |
| `/longhorn` | `LONGHORN_OAUTH2_PROXY_COOKIE_SECRET` | Base64-encoded random 32-byte cookie secret; generate with `openssl rand -base64 32` |
| `/openfga` | `OPENFGA_DATABASE_USERNAME` | Set to `openfga` |
| `/openfga` | `OPENFGA_DATABASE_PASSWORD` | PostgreSQL password for OpenFGA |
| `/openfga` | `OPENFGA_PRESHARED_KEYS` | Long random API key; multiple keys may be comma-separated for rotation |
| `/redis` | `REDIS_PASSWORD` | 64-character random hexadecimal password for the standalone Redis service; generate with `openssl rand -hex 32` |
| `/redis` | `REDISINSIGHT_ENCRYPTION_KEY` | 64-character random hexadecimal key for encrypting RedisInsight's saved connection data; generate with `openssl rand -hex 32` |

For `HARBOR_REGISTRY_HTPASSWD`, generate a bcrypt line with `htpasswd -B -n harbor_registry_user` and store the complete `username:hash` output; store the matching plaintext password separately in `HARBOR_REGISTRY_PASSWORD`. Harbor and both database Applications automatically sync these values into Kubernetes Secrets. The PostgreSQL bootstrap Secrets use the `kubernetes.io/basic-auth` type supported by the installed Infisical operator and carry the CNPG reload label.

CloudNativePG chart `0.29.1` installs operator `1.30.1` with two replicas on `cp`. Keycloak, Harbor, Backstage, and OpenFGA PostgreSQL clusters each run a primary and standby on `cp`; their anti-affinity is preferred so a single node does not leave replicas Pending. CNPG can promote a standby after a database pod failure, but both instances share the same server and disks. These clusters still have no backup configuration, so replication does not replace backups. Its Application in the `database` project does not prune chart resources or CRDs, protecting the databases if the chart changes; removing that Application from the root leaves its operator resources orphaned for deliberate cleanup. The cluster reports Kubernetes `1.37.2`, which CNPG 1.30 lists as tested but not officially supported; confirm operator health after Argo sync.

## Progressive delivery, identity, and policy

Argo Rollouts is installed from the `argo-rollouts` chart in the `platform` project. Its controller is pinned to `cp`; its read-only dashboard has two replicas on `cp`. Two OAuth2 Proxy replicas front the dashboard at `https://rollouts.kiroku.life`, authenticate with the Keycloak `voidlab` realm, and allow members of `argocd-admins`; the Gateway route targets the proxy rather than the dashboard Service. The proxy uses a confidential Keycloak client named `argo-rollouts`. Its client secret and OAuth2 Proxy cookie secret are read from Infisical `/argo-rollouts` as `ARGO_ROLLOUTS_OIDC_CLIENT_SECRET` and `ARGO_ROLLOUTS_OAUTH2_PROXY_COOKIE_SECRET`. The controller loads Gateway API traffic-router plugin `v0.11.0` from an init container and grants Gateway API provider RBAC only. The plugin's published provider table lists Istio `1.29.1` with plugin `0.11.0`; this cluster uses Istio `1.32.0` and Gateway API `1.6.1`, so that combination still needs an actual canary smoke test before using it for application releases. Rollouts and plugin support do not automatically convert existing Deployments to Rollout resources.

Keycloak uses upstream operator resources pinned to `26.8.2`, two Keycloak server instances, and a two-instance CloudNativePG database, all on `cp`. The namespace is not ambient-enrolled, so management traffic stays on the normal Kubernetes path. Keycloak is reachable at `https://keycloak.kiroku.life`, with TLS terminated by the shared Gateway and X-Forwarded headers enabled. The operator generates a temporary admin credential in `keycloak-initial-admin`; change it and enable MFA before relying on the identity service. The `voidlab` realm import creates the Policy Reporter OIDC client. Keycloak realm imports are create-only: rotating that client's secret later also requires updating the client in Keycloak. Create the `argo-rollouts` confidential OIDC client manually with standard flow and client authentication enabled, direct access grants disabled, redirect URI `https://rollouts.kiroku.life/oauth2/callback`, and web origin `https://rollouts.kiroku.life`. Add an Audience mapper for `argo-rollouts` to the ID and access tokens, plus a Group Membership mapper with token claim `groups` in the ID token. Keep Full group path off so the `argocd-admins` group claim matches OAuth2 Proxy's allowed group. Store the generated client secret in Infisical under the key listed below.

### Keycloak SSO for platform dashboards

Create the confidential clients in the `voidlab` realm using Standard flow and client authentication, with Direct access grants disabled. Add a Group Membership mapper with claim `groups`, include it in the ID token and userinfo, and turn Full group path off. OAuth2 Proxy protects OpenCost, Hubble, Kiali, and Longhorn at the Gateway and permits only the `argocd-admins` group. Store each client secret and a unique base64-encoded 32-byte cookie secret in the Infisical path/key table below. Grafana uses native OIDC; `argocd-admins` maps to Grafana server-admin and other users map to Viewer. Its local admin login remains enabled.

| Client ID | Redirect URI | Web origin |
| --- | --- | --- |
| `argo-rollouts` | `https://rollouts.kiroku.life/oauth2/callback` | `https://rollouts.kiroku.life` |
| `opencost` | `https://opencost.kiroku.life/oauth2/callback` | `https://opencost.kiroku.life` |
| `hubble` | `https://hubble.kiroku.life/oauth2/callback` | `https://hubble.kiroku.life` |
| `kiali-ui` | `https://kiali.kiroku.life/oauth2/callback` | `https://kiali.kiroku.life` |
| `longhorn` | `https://longhorn.kiroku.life/oauth2/callback` | `https://longhorn.kiroku.life` |
| `grafana` | `https://grafana.kiroku.life/login/generic_oauth` | `https://grafana.kiroku.life` |
| `technitium` | `https://dns.kiroku.life/sso/callback` | `https://dns.kiroku.life` |
| `harbor` | `https://harbor.kiroku.life/c/oidc/callback` | `https://harbor.kiroku.life` |

For Technitium, open Administration → SSO and enable OIDC using issuer `https://keycloak.kiroku.life/realms/voidlab`, client ID `technitium`, and Infisical secret `/dns/TECHNITIUM_KEYCLOAK_CLIENT_SECRET`. Register the callback shown by the UI if it differs from the URI above. Use `preferred_username` as the username claim and map `argocd-admins` to Technitium's Administrators group. Sign in at canonical host `https://dns.kiroku.life`.

For Harbor, sign in as the local admin and open Administration → Configuration → Authentication. Harbor cannot switch to OIDC while local users other than `admin` exist, so remove any such users first. Select OIDC, use endpoint `https://keycloak.kiroku.life/realms/voidlab`, client ID `harbor`, and Infisical secret `/harbor/HARBOR_KEYCLOAK_CLIENT_SECRET`. Set scopes to `openid,profile,email,offline_access`, group claim to `groups`, admin group to `argocd-admins`, username claim to `preferred_username`, and enable automatic onboarding. Register the callback Harbor displays if it differs from the URI above. Harbor's OIDC group mapping grants system-admin only to the configured group; assign project membership separately. Keep the local `admin` login as a break-glass path at `/account/sign-in`.

Kyverno chart `3.10.0` installs the admission, background, cleanup, and reports controllers on `cp` with the control-plane toleration. Cluster cleanup policies use the CEL-based `DeletingPolicy` API: completed or failed Jobs and terminal Pods are retained for seven days, while CronJobs are deleted only when explicitly marked with an expired `cleanup.voidlab.io/expire-at` RFC3339 label. The policies exclude Kubernetes and controller namespaces. Companion Audit `ValidatingPolicy` resources report current cleanup candidates to Policy Reporter. Kyverno emits Kubernetes Events for actual deletions; those events are not PolicyReports, so the Policy Reporter UI shows candidates and policy results rather than deletion history. Policy Reporter chart `3.11.2` installs its core service, Kyverno plugin, and UI, all pinned to `cp`. The UI is at `https://policy-reporter.kiroku.life` and uses Keycloak OIDC with PKCE. The UI presents policy reports and Kyverno policy details; Kyverno itself does not ship a separate dashboard.

Backstage chart `2.11.0` deploys the custom app source from the repository-root `backstage-app/` directory, outside this GitOps tree. The app uses Keycloak OIDC for sign-in. Its image is `harbor.kiroku.life/library/voidlab-backstage:1.57.0-keycloak-sync1`; build and push it to Harbor before syncing the chart. A project robot with pull access is synchronized from Infisical into the Backstage namespace as an image-pull Secret. A single-instance CloudNativePG database and the Backstage pod run on `cp` with the control-plane toleration. The Software Catalog loads `gitops/values/platform/backstage/catalog-info.yaml` for platform components. The Keycloak catalog module synchronizes enabled users with email who are direct members of the `backstage-users` Keycloak group, along with that group, every five minutes. Sign-in matches the Keycloak email to the synced User entity. To onboard someone, create or enable their Keycloak account, set an email address, and add them directly to `backstage-users`; no per-user catalog YAML edit is needed. Backstage is available at `https://backstage.kiroku.life`.

Create a confidential OIDC client with ID `backstage` in Keycloak's `voidlab` realm. Enable Standard flow and client authentication, disable Direct access grants, set the redirect URI to `https://backstage.kiroku.life/api/auth/oidc/handler/frame`, and set the web origin to `https://backstage.kiroku.life`. Create a separate confidential client with ID `backstage-catalog-sync`; enable service accounts and client authentication, then assign its service account the `realm-management` client roles `query-groups`, `query-users`, and `view-users`. The sync client uses client credentials only and does not need browser redirect URIs. Store its secret in Infisical at `/backstage/BACKSTAGE_KEYCLOAK_CATALOG_CLIENT_SECRET`. Create a Keycloak group named `backstage-users` and add each approved Backstage user directly to it. Set an email for every member; Backstage syncs only enabled group members with an email and uses that email to match OIDC sign-in to the catalog entity. Also store the `backstage` OIDC client secret at `/backstage/BACKSTAGE_KEYCLOAK_CLIENT_SECRET` and a separate random 32-byte base64 value at `/backstage/BACKSTAGE_AUTH_SESSION_SECRET`.

Build and push the image from your home LAN, where `harbor.kiroku.life` resolves directly to the Istio Gateway. From `backstage-app/`, use the repository-pinned Yarn 4.4.1 with Node 26: run `node .yarn/releases/yarn-4.4.1.cjs install --immutable`, `node .yarn/releases/yarn-4.4.1.cjs tsc`, and `node .yarn/releases/yarn-4.4.1.cjs build:backend`. Build the Linux amd64 image with `docker buildx build --platform linux/amd64 --load -f packages/backend/Dockerfile -t harbor.kiroku.life/library/voidlab-backstage:1.57.0-keycloak-sync1 .`, then push it separately with `docker push harbor.kiroku.life/library/voidlab-backstage:1.57.0-keycloak-sync1`. Use a Harbor robot account with push permission. Keep a separate pull-only robot's credentials in Infisical `/harbor` as `HARBOR_BACKSTAGE_PULL_USERNAME` and `HARBOR_BACKSTAGE_PULL_SECRET`; the GitOps resource syncs them into the `backstage-harbor-pull` Secret. Update the tag in `values/platform/backstage/values.yaml` when publishing a later image.

### Backstage internal dashboard links

The Software Catalog links to internal dashboards on `localhost`; run the matching command in a terminal on the same computer before opening the link:

| Backstage link | Port-forward |
| --- | --- |
| Argo CD | `kubectl -n argocd port-forward svc/argocd-server 8080:443` |
| Kiali | `kubectl -n istio-system port-forward svc/kiali 20001:20001` |
| Longhorn | `kubectl -n longhorn-system port-forward svc/longhorn-frontend 8081:80` |
| MinIO Console | `kubectl -n minio port-forward svc/minio-console 9001:9090` |
| Infisical | `kubectl -n security port-forward svc/infisical-infisical-standalone-infisical 8082:8080` |
| Grafana | `kubectl -n observability port-forward svc/kube-prometheus-stack-grafana 3000:80` |
| Prometheus | `kubectl -n observability port-forward svc/kube-prometheus-stack-prometheus 9091:9090` |
| Alertmanager | `kubectl -n observability port-forward svc/kube-prometheus-stack-alertmanager 9093:9093` |
| RedisInsight | `kubectl -n database port-forward svc/redisinsight-ui 5540:5540` |
| OpenCost | `kubectl -n opencost port-forward svc/opencost 9090:9090` |

### Argo Rollouts Gateway API smoke test

The Gateway API plugin is pinned to `v0.11.0`. Its published compatibility table lists Istio `1.29.1` with that plugin version, while this cluster runs Istio `1.32.0`; the provider docs say the plugin should work with Gateway API providers generally, but this exact combination is not confirmed here. No live canary test has run yet. After the manifests sync, use the plugin's [v0.11.0 quick start](https://rollouts-plugin-trafficrouter-gatewayapi.readthedocs.io/en/v0.11.0/quick-start/) in a disposable namespace, with its HTTPRoute attached to `istio-system/public` and a `*.kiroku.life` hostname. Confirm the route is `Accepted` and `ResolvedRefs`, update the demo image, verify the route backend weights change at each canary step, then promote and confirm the stable backend returns to 100%.

For any Git-managed application that uses this plugin, configure Argo CD to ignore HTTPRoute `.spec.rules` while the route has label `rollouts.argoproj.io/gatewayapi-canary: in-progress`, and enable `RespectIgnoreDifferences=true` for that Application. The plugin changes route weights during a rollout; without this Argo CD setting, reconciliation can overwrite those temporary weights.

Add these values to the `voidlab` Infisical project (`60e9131c-3eef-403a-b2b1-94c393caf930`), environment `prod`:

| Path | Infisical key | Purpose |
| --- | --- | --- |
| `/keycloak` | `KEYCLOAK_DATABASE_USERNAME` | Set to `keycloak` for the CNPG bootstrap user |
| `/keycloak` | `KEYCLOAK_DATABASE_PASSWORD` | PostgreSQL password for Keycloak |
| `/keycloak` | `POLICY_REPORTER_OIDC_CLIENT_SECRET` | Long random confidential-client secret, used in Keycloak and Policy Reporter |
| `/argo-rollouts` | `ARGO_ROLLOUTS_OIDC_CLIENT_SECRET` | Confidential-client secret for the Rollouts OAuth2 Proxy Keycloak client |
| `/argo-rollouts` | `ARGO_ROLLOUTS_OAUTH2_PROXY_COOKIE_SECRET` | Base64-encoded random 32-byte OAuth2 Proxy cookie secret; generate with `openssl rand -base64 32` |
| `/argocd` | `ARGOCD_OIDC_CLIENT_SECRET` | Long random confidential-client secret for the Argo CD Keycloak OIDC client |
| `/backstage` | `BACKSTAGE_DATABASE_USERNAME` | Set to `backstage` for the CNPG bootstrap user |
| `/backstage` | `BACKSTAGE_DATABASE_PASSWORD` | PostgreSQL password for Backstage |
| `/backstage` | `BACKSTAGE_BACKEND_SECRET` | Long random secret for Backstage backend tokens |
| `/backstage` | `BACKSTAGE_KEYCLOAK_CLIENT_SECRET` | Secret for the `backstage` Keycloak OIDC client |
| `/backstage` | `BACKSTAGE_KEYCLOAK_CATALOG_CLIENT_SECRET` | Client-credentials secret for the read-only Keycloak catalog sync client |
| `/backstage` | `BACKSTAGE_AUTH_SESSION_SECRET` | Random base64-encoded 32-byte secret for Backstage OIDC sessions |
| `/dns` | `TECHNITIUM_ADMIN_PASSWORD` | Strong initial password for the Technitium administrator account |
| `/dns` | `TECHNITIUM_KEYCLOAK_CLIENT_SECRET` | Confidential secret for Technitium's `technitium` OIDC client |
| `/external-dns` | `TECHNITIUM_API_TOKEN` | Technitium API token for the dedicated DNS automation user; create it in Technitium after its first start |
| `/cloudflare-tunnel` | `CLOUDFLARE_TUNNEL_TOKEN` | Connector token for the remotely managed Cloudflare Tunnel |

The Gateway uses the existing wildcard certificate. ExternalDNS creates private Technitium records from `HTTPRoute` hostnames, pointing them to `192.168.29.254`. Cloudflare's public wildcard CNAME and the Access application are configured in the Cloudflare dashboard and point public traffic through the Tunnel connector.

## Pruning

The MinIO tenant, MinIO access provisioners, observability, cert-manager, Let's Encrypt, Headlamp, platform services, standalone Redis, public Gateway, and Kiali Applications use automated sync, self-heal, retry, and Argo CD's resources finalizer. The MinIO tenant Application leaves pruning disabled to protect its stateful tenant resources. The CloudNativePG operator Application also leaves pruning disabled and has no cascading finalizer to protect its CRDs. Other included Applications prune resources removed from their source; `allowEmpty` is enabled only where explicitly listed. Removing an Application manifest from Git removes that Application and cascades deletion to resources it manages when a finalizer is configured. Removing a resource from an Application source prunes that resource when pruning is enabled.

## Structure

Keep each component in the existing project/application/values layout:

```text
applications/
├── networking/policies/application.yaml
├── networking/istio/{gateway-api,base,istiod,cni,ztunnel,gateway-placement,kiali,hubble-auth,public-gateway}/application.yaml
├── dns/{technitium,external-dns,coredns,cloudflared}/application.yaml
├── security/{cert-manager,letsencrypt}/application.yaml
├── security/infisical/application.yaml
├── security/infisical-secrets-operator/application.yaml
├── security/{keycloak-operator,keycloak-database,keycloak,kyverno,policy-reporter}/application.yaml
├── storage/longhorn/application.yaml
├── storage/{minio,minio-observability-access,minio-harbor-access}/application.yaml
├── platform/headlamp/application.yaml
├── platform/argocd-auth/application.yaml
├── platform/{argo-rollouts,backstage}/application.yaml
├── platform/{harbor-database,harbor,opencost,openfga-database,openfga}/application.yaml
├── database/{cloudnative-pg,redis,redisinsight}/application.yaml
└── observability/{observability-credentials,kube-prometheus-stack,loki,tempo,opentelemetry-collector}/application.yaml

gateway-api/
├── kustomization.yaml
├── gateway/public/gateway.yaml
└── routes/
    ├── kustomization.yaml              # audit/build inventory; not deployed directly
    ├── shared/                          # HTTP to HTTPS redirects
    ├── observability/                   # Grafana, Prometheus, Alertmanager
    ├── argocd/                          # and one module for each app route
    ├── backstage/
    ├── headlamp/                        # includes the CloudNativePG plugin
    ├── redisinsight/
    ├── keycloak/
    ├── argo-rollouts/
    ├── longhorn/
    ├── minio/
    ├── infisical/
    ├── policy-reporter/
    ├── technitium/
    ├── kiali/
    ├── harbor/
    ├── opencost/
    └── hubble/

projects/
├── networking/networking.yaml
├── service-mesh/service-mesh.yaml
├── security/security.yaml
├── platform/platform.yaml
├── database/database.yaml
├── storage/storage.yaml
├── observability/observability.yaml
└── dns/dns.yaml

values/
├── networking/istio/*.yaml, OAuth2 Proxy values/resources, and resources/gatewayclass-defaults.yaml
├── dns/{technitium,external-dns,coredns,cloudflared}/
├── security/cert-manager/cert-manager-values.yaml
├── security/letsencrypt/resources/acme.yaml
├── security/infisical-secrets-operator/values.yaml and resources/
├── security/{keycloak-operator,keycloak-database,keycloak,kyverno,policy-reporter}/values.yaml and resources/
├── storage/minio/operator-values.yaml, tenant-values.yaml, and resources/
├── storage/minio/{observability-access,harbor-access}/resources/
├── security/infisical/values.yaml and resources/
├── storage/longhorn/{values,oauth2-proxy-values}.yaml and resources/
├── platform/headlamp/values.yaml
├── platform/argocd-auth/resources/{argocd-cm,argocd-rbac-cm,infisical-static-secret}.yaml
├── platform/argo-rollouts/{values,oauth2-proxy-values}.yaml and resources/
├── platform/backstage/values.yaml and resources/
├── platform/{harbor,openfga}/values.yaml and resources/
├── platform/opencost/{values,oauth2-proxy-values}.yaml and resources/
├── platform/{harbor-database,openfga-database}/resources/
├── database/cloudnative-pg/values.yaml
├── database/redis/resources/{infisical-static-secret,service,statefulset}.yaml
├── database/redisinsight/resources/{deployment,infisical-static-secret,pvc,service}.yaml
└── observability/{credentials,kube-prometheus-stack,loki,tempo,opentelemetry-collector}/values.yaml and resources/

policies/
├── cilium/kustomization.yaml
│   └── network-policies/kustomization.yaml and Cilium policy/LB manifests
├── istio/kiali/kustomization.yaml and Kiali ambient HBONE NetworkPolicy
└── kyverno/kustomization.yaml
    └── cleanup/kustomization.yaml, RBAC, DeletingPolicies, and Audit policies

```

The custom Backstage app source lives separately at repository root in `backstage-app/`; only deployment values and catalog metadata live in this GitOps tree. Helm values and component manifests stay under `values/<project>/<application>/`. AppProjects and child Applications stay under `projects/` and `applications/`. Do not commit secret values as plaintext.
