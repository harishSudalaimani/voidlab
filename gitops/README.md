# VoidLab GitOps

## Current scope

GitOps deploys Cilium network policies, Istio ambient, Longhorn, Infisical, MinIO, cert-manager with Let's Encrypt DNS-01, Headlamp, the observability stack, Harbor, OpenCost, OpenFGA, CloudNativePG, standalone Redis, RedisInsight, Argo Rollouts, Keycloak, Kyverno, Policy Reporter, Backstage, Technitium DNS, ExternalDNS, and the CoreDNS forwarding configuration. Cilium itself remains installed and managed by Pulumi. Pulumi also installs Argo CD and creates the root `voidlab-applications` Application. That root Application reads the AppProject and child Application manifests from this directory, using Argo CD's built-in `default` project. Workload Applications use their dedicated `networking`, `service-mesh`, `storage`, `security`, `observability`, `database`, `platform`, or `dns` project.

The `networking` AppProject allows Cilium network policies, LB IP pools, and L2 announcement policies. Manifests under `policies/cilium-network-policies/` are applied by Argo CD; Pulumi retains ownership of the Cilium installation. The public Istio Gateway pool is restricted to `192.168.29.254/32` and the `istio-system/public-istio` Service. Its L2 announcement is restricted to the control-plane node's `enp8s0` interface.

Before syncing the public Gateway pool, keep the router DHCP range at `192.168.29.2–192.168.29.199` so it cannot lease the VIP. Cilium's Pulumi Helm release enables `l2announcements.enabled=true` and already has `kubeProxyReplacement=true`. Cilium auto-detects devices because the node interfaces have different names; verify `enp8s0` is selected on `cp` before relying on the Gateway VIP. Apply the Cilium Pulumi update before the networking-policies Application syncs the announcement policy.

The Istio stack uses ambient mode and Gateway API. It is kept separate from the narrow Cilium `networking` project under the `service-mesh` AppProject. Istio 1.32.0 and Gateway API v1.6.1 are pinned together because Istio 1.32 lists Gateway API v1.6.1 as its tested version and supports Kubernetes 1.37. The Gateway API CRDs are sourced from the upstream tagged repository, using its `config/crd/experimental` manifests. The Gateway API CRD Application uses server-side apply and does not prune CRDs, since deleting a CRD also deletes every Gateway API object.

DNS follows the route-driven design: Gateway API `HTTPRoute` hostnames are the desired names, ExternalDNS watches only the `gateway-httproute` source and writes records to Technitium through its webhook API, and the existing kubeadm CoreDNS service forwards queries to Technitium. Technitium forwards public lookups to `1.1.1.1` and `9.9.9.9`; it is the internal authority for the `kiroku.life` zone. The Gateway advertises its `192.168.29.254` VIP through an ExternalDNS target annotation. Technitium's web UI is available at `https://dns.kiroku.life`; both it and ExternalDNS are scheduled on `cp` with the control-plane toleration. The Technitium DNS Service is cluster-internal, so this configuration serves Kubernetes pods and does not change router DHCP or LAN clients' DNS settings.

Before ExternalDNS can publish records, connect to the Technitium UI on first install with `kubectl -n dns port-forward svc/technitium 5380:5380` and open `http://localhost:5380`. Create the primary `kiroku.life` zone, then create an API token for a dedicated DNS automation user with permission to manage records in that zone. Store the admin password and API token in Infisical as described below. The webhook image currently uses the upstream `latest` tag because its README still shows a placeholder version; pin a published image tag when the project releases one. CoreDNS's existing `kube-system/coredns` ConfigMap is adopted by the `coredns-forwarding` Application. Compare it with the live ConfigMap before syncing and preserve any local Corefile customizations; this manifest manages the entire Corefile and uses the kubeadm default plugin chain.

The two CNI components have separate roles: Cilium assigns Pod IPs and provides primary pod networking; Istio CNI is chained after Cilium to set up ambient traffic redirection through ztunnel. Istio CNI and ztunnel run as DaemonSets across every node, including `cp`. Cilium remains installed and managed by Pulumi; the added values only configure Cilium to coexist with Istio's chained plugin and redirection.

**Apply the Pulumi Cilium compatibility update before enabling Istio CNI.** This cluster uses Cilium kube-proxy replacement. The Pulumi stack sets `cni.exclusive=false` and `socketLB.hostNamespaceOnly=true` for Istio chaining and redirection, and explicitly leaves `bpf.masquerade=false` for ambient health-probe compatibility. Confirm that Pulumi update is applied before the automatic `istio-cni` sync. Do not enroll workloads before both node DaemonSets are healthy. [Cilium's Istio integration guide](https://docs.cilium.io/en/latest/network/servicemesh/istio/) [Istio's Cilium prerequisites](https://istio.io/latest/docs/ambient/install/platform-prerequisites/)

The Istio controller, Kiali, the public Gateway, and Headlamp are pinned to `cp` and tolerate the control-plane taint. The shared `public` Gateway uses class `istio`, terminates HTTPS with the wildcard Let's Encrypt certificate, and redirects HTTP to HTTPS. Its listeners accept routes for `*.kiroku.life`. The host firewall currently restricts Gateway ports to the configured LAN CIDR; direct WAN access requires intentionally widening that source rule before adding router port forwards and public Cloudflare records. Istiod creates a waypoint when you add a Gateway API `Gateway` using class `istio-waypoint`; no waypoint is created until a namespace or service needs L7 processing. The `minio`, `observability`, and `headlamp` namespaces are enrolled through their Argo CD Applications, and Kiali's server pod is enrolled individually. Because Argo automatically syncs these labels, verify Istio CNI and ztunnel are healthy on every node before pushing a change that enables enrollment.

Kiali uses the Prometheus service over HTTP inside ambient mTLS for graph metrics and metric-based health views. Kiali uses its default token authentication and stays internal; use `kubectl -n istio-system port-forward svc/kiali 20001:20001` to open the UI. Headlamp chart `0.46.0` is available at `https://headlamp.kiroku.life` after the Gateway has a reachable LoadBalancer address and the public DNS record points to it. Headlamp uses per-user bearer-token login; its own service account is restricted to the built-in `view` role. Do not enable shared service-account authentication for a public deployment.

All Istio child Applications automatically sync. Their retry policy allows components to converge as prerequisite CRDs and controllers become available. The Cilium compatibility update must already be applied before `istio-cni` can work correctly.

Before syncing the ambient labels, verify with `kubectl get ds -n istio-system` and `kubectl get pods -n istio-system -o wide`; there should be one ready Istio CNI and one ready ztunnel pod on each node. Also check `kubectl get gatewayclass`. Use a matching Istio 1.32 `istioctl` for diagnostics. Istio ambient mTLS provides encryption and workload identity between enrolled pods; applications use HTTP on in-mesh links.

Longhorn and MinIO use the `storage` AppProject. One MinIO Application manages both the MinIO Operator and Tenant charts in the `minio` namespace. The tenant runs as a single server on `cp`, tolerates the control-plane taint, and requests a 1 TiB volume from a dedicated Longhorn StorageClass with two replicas and `WaitForFirstConsumer` (about 2 TiB of raw Longhorn capacity).

The Infisical Kubernetes Secrets Operator is a shared add-on under the `security` project; its `InfisicalConnection` and `InfisicalAuth` are reusable by MinIO and future applications. Create a read-only Universal Auth machine identity in the Infisical UI, then create `security/infisical-universal-auth` in Kubernetes with its `clientId` and `clientSecret`. Keep those credentials out of Git. Each application adds only its own `InfisicalStaticSecret` resource and references `infisical-shared` in the `security` namespace. The existing Infisical server release is unchanged.

The `cert-manager` Application installs cert-manager in the `cert-manager` namespace. A separate `letsencrypt` Application creates staging and production Cloudflare DNS-01 `ClusterIssuer` resources and a wildcard certificate for `kiroku.life` and `*.kiroku.life`, stored in `istio-system` for the Gateway. Add `CLOUDFLARE_DNS_API_TOKEN` to the `voidlab` Infisical project, environment `prod`, path `/cert-manager`. Use a Cloudflare API Token scoped to the `kiroku.life` zone with `Zone - DNS - Edit` and `Zone - Zone - Read`; the token is synchronized to the `cert-manager` namespace and never stored in Git. The ACME account email is `snharish85@gmail.com`. cert-manager's CRDs are enabled and retained. The chart is pinned to `v1.21.3`; it is scheduled on `cp` and tolerates the control-plane taint. Upstream lists cert-manager 1.21 as supporting Kubernetes only through 1.36, while this cluster reports 1.37.2, so verify compatibility before relying on cert-manager for public certificates or upgrading it.

MinIO's `InfisicalStaticSecret` reads project ID `60e9131c-3eef-403a-b2b1-94c393caf930` (project name `voidlab`), environment `prod`, path `/minio`, and writes `minio-env-configuration`. No CA certificate is needed in that path for internal MinIO traffic: auto-TLS is disabled, so MinIO serves HTTP on the Tenant Service's port 80 while Istio ambient mTLS protects in-mesh traffic. The shared public Gateway terminates external HTTPS with the wildcard Let's Encrypt certificate.

The `minio-observability-access` Application automatically provisions the Loki/Tempo service account from the Infisical keys at `/observability`. It creates a MinIO service account with an inline policy limited to `loki-chunks`, `loki-ruler`, and `tempo-traces`; a CronJob reapplies credentials and policy every two minutes so Infisical rotations are reconciled promptly. The same Infisical credentials are synced into the `observability` namespace for Loki and Tempo. A separate `minio-harbor-access` Application creates the `harbor` bucket and a Harbor-only service account from `/harbor`; its policy is scoped to that bucket and its objects.

MinIO's community Operator and Tenant charts are pinned at `7.1.1`; the community repositories were archived in 2026. The Tenant uses Chainguard's public MinIO image (`docker.io/chainguard/minio:latest`) because anonymous pulls from MinIO's old Quay image now fail. Its pool security context matches the image's non-root UID/GID 65532. The `latest` tag follows Chainguard's current build on each pod start. The tenant is configured as a single server and is not a distributed or highly available MinIO deployment.

Infisical uses the official `infisical-standalone` chart with its bundled PostgreSQL and Redis dependencies enabled. These remain part of the Infisical Application in the `security` project, not separate platform apps. Infisical, PostgreSQL, and Redis are pinned to `cp`; their persistent data uses Longhorn. Kubernetes Ingress and the chart's bundled ingress controller are disabled; use `kubectl -n security port-forward svc/infisical-infisical-standalone-infisical 8082:8080` and open `http://localhost:8082` for initial setup. Public tool routes use Gateway API HTTPRoutes attached to Istio's `public` Gateway.

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

The bundled PostgreSQL and Redis instances are single-instance proof-of-concept dependencies, not HA services. Harbor also retains its chart-bundled Redis. Redis stays managed by each parent Helm Application; it is not a standalone resource in the `database` project. Add other shared data services or application workloads later as separate GitOps Applications after this phase is confirmed healthy.

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

## Database and platform projects

The `database` AppProject installs the CloudNativePG operator in `cnpg-system` on `cp`, standalone Redis, and RedisInsight in the `database` namespace. The operator namespace is not ambient-enrolled so its Kubernetes admission webhook remains on its normal control-plane TLS path; the database namespace is ambient-enrolled for Istio mTLS. The Redis StatefulSet is pinned to `cp`, uses an 8 GiB Longhorn PVC, append-only persistence, and a password from Infisical. Its in-cluster endpoint is `redis.database.svc.cluster.local:6379`. It is a single instance with no failover or backup configuration, so configure and verify backups before relying on it for irreplaceable data. Redis uses `noeviction`; clients receive write errors when its 512 MiB data limit is full. RedisInsight is also pinned to `cp`, stores its local data on Longhorn, and is preconfigured for the standalone Redis service. It has no public HTTPRoute because RedisInsight has no built-in UI login; use `kubectl -n database port-forward svc/redisinsight-ui 5540:5540` and open `http://localhost:5540`. Redis remains bundled with Harbor and Infisical as well; their chart resources stay in their parent Applications' projects and are separate from this standalone instance.

The working Headlamp deployment includes the official CloudNativePG plugin. Open Headlamp at `https://headlamp.kiroku.life` and select the CloudNativePG section. Its service account receives read-only access to CloudNativePG custom resources. Headlamp users authenticate with their own Kubernetes credentials, so the actions available to each user follow their own Kubernetes RBAC.

Harbor stores registry images and charts in the MinIO `harbor` bucket, using its bucket-scoped service account. Harbor's PostgreSQL credentials and chart secrets come from Infisical path `/harbor`. Harbor is reachable at `https://harbor.kiroku.life` through an Istio Gateway API `HTTPRoute`; the public Gateway terminates Let's Encrypt TLS and ambient mTLS protects in-cluster service traffic. Its database and MinIO endpoints use HTTP/PostgreSQL TLS disabled at the application layer because the Harbor namespace is enrolled in ambient mode. Harbor keeps Trivy and job logs on Longhorn PVCs.

OpenCost queries `kube-prometheus-stack-prometheus.observability.svc.cluster.local:9090` over HTTP inside ambient mTLS and registers a ServiceMonitor with the label selected by the existing Prometheus instance. The OpenCost UI/API has no built-in authentication, so no public Gateway route is created yet. Use `kubectl -n opencost port-forward svc/opencost 9090:9090` and open `http://localhost:9090`; add an authenticated access layer before exposing it through the shared Gateway.

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
| `/harbor` | `HARBOR_MINIO_ACCESS_KEY` | MinIO service-account key; keep it at 20 characters or fewer |
| `/harbor` | `HARBOR_MINIO_SECRET_KEY` | MinIO service-account secret key |
| `/harbor` | `HARBOR_DATABASE_USERNAME` | Set to `harbor` |
| `/harbor` | `HARBOR_DATABASE_PASSWORD` | PostgreSQL password for Harbor |
| `/openfga` | `OPENFGA_DATABASE_USERNAME` | Set to `openfga` |
| `/openfga` | `OPENFGA_DATABASE_PASSWORD` | PostgreSQL password for OpenFGA |
| `/openfga` | `OPENFGA_PRESHARED_KEYS` | Long random API key; multiple keys may be comma-separated for rotation |
| `/redis` | `REDIS_PASSWORD` | 64-character random hexadecimal password for the standalone Redis service; generate with `openssl rand -hex 32` |
| `/redis` | `REDISINSIGHT_ENCRYPTION_KEY` | 64-character random hexadecimal key for encrypting RedisInsight's saved connection data; generate with `openssl rand -hex 32` |

For `HARBOR_REGISTRY_HTPASSWD`, generate a bcrypt line with `htpasswd -B -n harbor_registry_user` and store the complete `username:hash` output; store the matching plaintext password separately in `HARBOR_REGISTRY_PASSWORD`. Harbor and both database Applications automatically sync these values into Kubernetes Secrets. The PostgreSQL bootstrap Secrets use the `kubernetes.io/basic-auth` type supported by the installed Infisical operator and carry the CNPG reload label.

CloudNativePG chart `0.29.1` installs operator `1.30.1`. Its Application in the `database` project does not prune chart resources or CRDs, protecting the databases if the chart changes; removing that Application from the root leaves its operator resources orphaned for deliberate cleanup. The cluster reports Kubernetes `1.37.2`, which CNPG 1.30 lists as tested but not officially supported; confirm operator health after Argo sync. The CNPG databases are single-instance home-lab deployments with no backup configuration yet, so set up and verify backups before relying on them for irreplaceable data.

## Progressive delivery, identity, and policy

Argo Rollouts is installed from the `argo-rollouts` chart in the `platform` project. Its controller and read-only dashboard are pinned to `cp` and tolerate the control-plane taint. The dashboard is available at `https://rollouts.kiroku.life` through the existing Istio Gateway API. The controller loads Gateway API traffic-router plugin `v0.11.0` from an init container and grants Gateway API provider RBAC only. The plugin's published provider table lists Istio `1.29.1` with plugin `0.11.0`; this cluster uses Istio `1.32.0` and Gateway API `1.6.1`, so that combination still needs an actual canary smoke test before using it for application releases. Rollouts and plugin support do not automatically convert existing Deployments to Rollout resources.

Keycloak uses upstream operator resources pinned to `26.8.2`, plus a single-instance CloudNativePG database. The operator, database, and Keycloak server run on `cp`; the Keycloak CR uses required node affinity and a control-plane toleration. The Keycloak namespace is not ambient-enrolled, so management traffic stays on the normal Kubernetes path. Keycloak is reachable at `https://sso.kiroku.life`, with TLS terminated by the shared Gateway and X-Forwarded headers enabled. The operator generates a temporary admin credential in `keycloak-initial-admin`; change it and enable MFA before relying on the identity service. The `voidlab` realm import creates the Policy Reporter OIDC client. Keycloak realm imports are create-only: rotating that client's secret later also requires updating the client in Keycloak.

Kyverno chart `3.10.0` installs the admission, background, cleanup, and reports controllers on `cp` with the control-plane toleration. It installs the Kyverno and WG Policy report CRDs, but no enforcement policies are bundled; add policies after reviewing their effects. Policy Reporter chart `3.11.2` installs its core service, Kyverno plugin, and UI, all pinned to `cp`. The UI is at `https://policy-reporter.kiroku.life` and uses Keycloak OIDC with PKCE. The UI presents policy reports and Kyverno policy details; Kyverno itself does not ship a separate dashboard.

Backstage chart `2.11.0` is deployed with the pinned official image `ghcr.io/backstage/backstage:1.55.2`, a single-instance CloudNativePG database, and `cp` node placement plus control-plane toleration. Its Software Catalog loads `gitops/backstage/catalog-info.yaml`, which catalogs the GitOps-managed services and supporting components, links their dashboards, and records service dependencies. Backstage is available at `https://backstage.kiroku.life`. The current generic image provides the Software Catalog and dashboard launchpad; live Kubernetes and Argo CD plugin pages require a tailored Backstage image with those plugins installed and configured.

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

The Gateway API plugin is pinned to `v0.11.0`. Its published compatibility table lists Istio `1.29.1` with that plugin version, while this cluster runs Istio `1.32.0`; the provider docs say the plugin should work with Gateway API providers generally, but this exact combination is not confirmed here. No live test has run yet because this workspace has no active `kubectl` context. After the manifests sync, use the plugin's [v0.11.0 quick start](https://rollouts-plugin-trafficrouter-gatewayapi.readthedocs.io/en/v0.11.0/quick-start/) in a disposable namespace, with its HTTPRoute attached to `istio-system/public` and a `*.kiroku.life` hostname. Confirm the route is `Accepted` and `ResolvedRefs`, update the demo image, verify the route backend weights change at each canary step, then promote and confirm the stable backend returns to 100%.

For any Git-managed application that uses this plugin, configure Argo CD to ignore HTTPRoute `.spec.rules` while the route has label `rollouts.argoproj.io/gatewayapi-canary: in-progress`, and enable `RespectIgnoreDifferences=true` for that Application. The plugin changes route weights during a rollout; without this Argo CD setting, reconciliation can overwrite those temporary weights.

Add these values to the `voidlab` Infisical project (`60e9131c-3eef-403a-b2b1-94c393caf930`), environment `prod`:

| Path | Infisical key | Purpose |
| --- | --- | --- |
| `/keycloak` | `KEYCLOAK_DATABASE_USERNAME` | Set to `keycloak` for the CNPG bootstrap user |
| `/keycloak` | `KEYCLOAK_DATABASE_PASSWORD` | PostgreSQL password for Keycloak |
| `/keycloak` | `POLICY_REPORTER_OIDC_CLIENT_SECRET` | Long random confidential-client secret, used in Keycloak and Policy Reporter |
| `/backstage` | `BACKSTAGE_DATABASE_USERNAME` | Set to `backstage` for the CNPG bootstrap user |
| `/backstage` | `BACKSTAGE_DATABASE_PASSWORD` | PostgreSQL password for Backstage |
| `/backstage` | `BACKSTAGE_BACKEND_SECRET` | Long random secret for Backstage backend tokens |
| `/dns` | `TECHNITIUM_ADMIN_PASSWORD` | Strong initial password for the Technitium administrator account |
| `/external-dns` | `TECHNITIUM_API_TOKEN` | Technitium API token for the dedicated DNS automation user; create it in Technitium after its first start |

The public Gateway routes use the existing wildcard certificate. ExternalDNS creates the `rollouts`, `sso`, `policy-reporter`, `backstage`, and `dns` records from their `HTTPRoute` hostnames, pointing them to the public Gateway VIP. The current host firewall restricts Gateway access to the LAN CIDR; these hostnames do not make the Gateway reachable from the WAN.

## Pruning

The MinIO tenant, MinIO access provisioners, observability, cert-manager, Let's Encrypt, Headlamp, platform services, standalone Redis, public Gateway, and Kiali Applications use automated sync, self-heal, retry, and Argo CD's resources finalizer. The MinIO tenant Application leaves pruning disabled to protect its stateful tenant resources. The CloudNativePG operator Application also leaves pruning disabled and has no cascading finalizer to protect its CRDs. Other included Applications prune resources removed from their source; `allowEmpty` is enabled only where explicitly listed. Removing an Application manifest from Git removes that Application and cascades deletion to resources it manages when a finalizer is configured. Removing a resource from an Application source prunes that resource when pruning is enabled.

## Structure

Keep each component in the existing project/application/values layout:

```text
applications/
├── networking/policies/application.yaml
├── networking/istio/{gateway-api,base,istiod,cni,ztunnel,gateway-placement,kiali,public-gateway}/application.yaml
├── dns/{technitium,external-dns,coredns}/application.yaml
├── security/{cert-manager,letsencrypt}/application.yaml
├── security/infisical/application.yaml
├── security/infisical-secrets-operator/application.yaml
├── security/{keycloak-operator,keycloak-database,keycloak,kyverno,policy-reporter}/application.yaml
├── storage/longhorn/application.yaml
├── storage/{minio,minio-observability-access,minio-harbor-access}/application.yaml
├── platform/headlamp/application.yaml
├── platform/{argo-rollouts,backstage}/application.yaml
├── platform/{harbor-database,harbor,opencost,openfga-database,openfga}/application.yaml
├── database/{cloudnative-pg,redis,redisinsight}/application.yaml
└── observability/{observability-credentials,kube-prometheus-stack,loki,tempo,opentelemetry-collector}/application.yaml

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
├── networking/istio/*.yaml and resources/gatewayclass-defaults.yaml
├── networking/istio/public-gateway/gateway.yaml
├── dns/{technitium,external-dns,coredns}/
├── security/cert-manager/cert-manager-values.yaml
├── security/letsencrypt/resources/acme.yaml
├── security/infisical-secrets-operator/values.yaml and resources/
├── security/{keycloak-operator,keycloak-database,keycloak,kyverno,policy-reporter}/values.yaml and resources/
├── storage/minio/operator-values.yaml, tenant-values.yaml, and resources/
├── storage/minio/{observability-access,harbor-access}/resources/
├── security/infisical/values.yaml and resources/
├── storage/longhorn/values.yaml and resources/
├── platform/headlamp/values.yaml
├── platform/argo-rollouts/values.yaml
├── platform/backstage/values.yaml and resources/
├── platform/{harbor,opencost,openfga}/values.yaml and resources/
├── platform/{harbor-database,openfga-database}/resources/
├── database/cloudnative-pg/values.yaml
├── database/redis/resources/{infisical-static-secret,service,statefulset}.yaml
├── database/redisinsight/resources/{deployment,infisical-static-secret,pvc,service}.yaml
└── observability/{credentials,kube-prometheus-stack,loki,tempo,opentelemetry-collector}/values.yaml and resources/

policies/
└── cilium-network-policies/kustomization.yaml and Cilium policy/LB manifests

backstage/
└── catalog-info.yaml
```

Helm values and component manifests stay under `values/<project>/<application>/`. AppProjects and child Applications stay under `projects/` and `applications/`. Do not commit secret values as plaintext.
