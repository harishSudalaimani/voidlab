# VoidLab GitOps

Argo CD manages platform projects, application definitions, and cluster policies from this directory. Pulumi creates the `voidlab-applications` root Application and the initial `bootstrap` AppProject. Active AppProjects live under `projects/`; applications use their matching project and never Argo CD's built-in `default` project. The root Application includes YAML under `projects/`, `applications/`, and `policies/`. Helm values under `values/` are read by child Applications and are not applied directly.

## Storage and platform deployment order

Argo CD applies child Applications in sync-wave order and waits for each Application to be Synced and Healthy before starting the next wave. Applications in the same wave can start together:

1. Longhorn, Kyverno, and the `security` Namespace (`storage`/`security`, wave 0)
2. CloudNativePG operator and Infisical Secret replication (`storage`/`security`, wave 1)
3. Shared PostgreSQL cluster (`storage`, wave 2)
4. Shared Redis service (`storage`, wave 3)
5. Self-hosted Infisical (`security`, wave 4)
6. Infisical Secrets Operator (`security`, wave 5)
7. MinIO (`storage`, wave 6)

The ordering depends on Application and CloudNativePG Cluster health checks enabled in the Argo CD Helm values managed by `infra/argocd/pulumi`. Apply the Argo CD Pulumi update before relying on these waves. The Application check waits for both `Synced` and `Healthy`, and reports terminal sync or comparison errors as `Degraded`; the CloudNativePG Cluster check waits for its `Ready=True` condition, so the shared data services are ready before Infisical starts. MinIO now auto-syncs like the other child Applications. Its StorageClass is declared in Git; the tenant remains unhealthy until Infisical supplies `minio-env-configuration`.

Longhorn's default `longhorn` StorageClass uses two replicas because the cluster has two storage nodes. Its pre-upgrade chart hook is disabled in the values file and enforced as an Argo CD Helm parameter, because that hook can run before the service account exists on a fresh GitOps install. The chart settings are in `values/storage/longhorn/values.yaml`; the Argo-specific override is in `applications/storage/longhorn/application.yaml`.

### Longhorn disks and node placement

Kubernetes bootstrap prepares Longhorn's `open-iscsi` and NFS prerequisites on both Fedora nodes. It requires the existing `/data/vms` SSD and `/storage` HDD mounts on `cp`, stores containerd images on the SSD, and creates Longhorn directories under both mounts; `worker` uses `/var/lib/longhorn` on its root disk. Longhorn disk annotations reserve no extra capacity, and volumes use two replicas across `cp` and `worker`. Longhorn's user-facing control components run on `cp`; its storage manager and system-managed storage components can run on both nodes. Longhorn may consume all reported free disk space, so filling a disk, especially the worker root disk shared with Fedora and Kubernetes, can affect the node.

Argo CD, Cilium's operator, Hubble Relay/UI, Longhorn's control components, the CloudNativePG operator, Redis, the Infisical service and Secrets Operator, and the MinIO operator and tenant are pinned to `cp`. The Cilium agent and Envoy DaemonSets run on both nodes because each node needs the network datapath. Ordinary application pods are pinned to `worker` where configured, and the Kubernetes control-plane taint keeps the remaining application pods off `cp`. The PostgreSQL cluster tolerates that taint and requires its two instances to run on different hosts, placing one replica on each server.

### Shared PostgreSQL and Redis

The `storage` project owns shared data services in the `database` namespace. It installs CloudNativePG chart `0.29.2` (operator `1.30.2`) on `cp` and creates a two-instance PostgreSQL cluster on Longhorn, with one instance required on each physical server. The instances tolerate the control-plane taint so the database can use both nodes; required host anti-affinity prevents both replicas from sharing one server. The initial database and role are `infisical`; future services should get their own database and role on this same cluster, with credentials delivered to their namespace through the secrets platform. This isolates each service's database objects while reusing the PostgreSQL cluster. The CNPG application is named `postgresql-cluster`, independent of any consuming application. Infisical reads `postgresql-app`, which CNPG generates in `database` and Kyverno mirrors to `security`; future apps should not reuse that role.

The shared Redis service is a single Redis instance on Longhorn. It has no password so it can start before Infisical; a NetworkPolicy limits connections to namespaces labelled `platform.voidlab.io/shared-redis-client: "true"`. Label future workload namespaces only when they are authorized to use Redis. Infisical currently uses Redis database index `0`; assign another logical database or a service-specific key prefix to future consumers. Redis is a single replica and therefore a shared availability limit.

PostgreSQL backups are not configured yet; add an S3-compatible backup destination after MinIO is resumed or another target is chosen.

The infrastructure code currently selects Kubernetes `1.37`. CloudNativePG `1.30.x` lists Kubernetes `1.34`–`1.36` as supported and `1.37` as tested, but not supported. The pinned operator is the latest stable release at this revision, but that Kubernetes support caveat still applies.

Infisical and its Secrets Operator run in the `security` namespace; the Infisical server pods are pinned to `cp`, and the service remains internal (`ClusterIP`) with no ingress or NodePort. The `security-namespace` Application owns the Namespace and labels it as an authorized Redis client. The Infisical Secret replication Application declares the destination Secret objects in `security`; Kyverno clones only the named source Secrets from `database` and keeps their data synchronized. Argo CD ignores those two data fields and prunes the destination Secret objects when the replication Application is removed. It copies only `database/platform-secrets` and `database/postgresql-app`.

`platform-secrets` is a bootstrap input: it must already exist in `database` with `ENCRYPTION_KEY` and `AUTH_SECRET`, provisioned from a trusted secret source. Do not put those values in Git. Infisical cannot supply the keys it needs to start itself. CloudNativePG creates `database/postgresql-app`; Kyverno copies it after it appears. Restoring a missing `database/platform-secrets` source is still required before Infisical can become ready. For UI access, run `kubectl -n security port-forward svc/infisical 8081:8080` and open `http://localhost:8081`. `SITE_URL` is set to that local address. Redis has no password and NetworkPolicy restricts access to authorized namespaces. Use Infisical to manage application secrets once it is running. If you later expose Infisical through a hostname, update `SITE_URL` and configure the matching TLS route.

The Infisical Secrets Operator is configured to connect to the self-hosted service through cluster DNS and is applied only after Infisical is healthy. It is currently scoped to `minio-tenant`; add each future workload namespace to its scope and RBAC before syncing secrets there. MinIO auto-syncs and prunes from Git. Its Application declares both namespaces and `longhorn-minio` before applying the charts. That StorageClass selects the Longhorn `cp` node and uses two replicas across its configured disks; node-level soft anti-affinity is enabled because the MinIO pool is pinned to `cp`. This protects against an individual disk failure but not loss of the `cp` server. The tenant still requires `minio-env-configuration` with a `config.env` value supplied from Infisical; MinIO credentials are not stored in Git.

Every child Application has Argo CD's resources finalizer, automated sync, self-heal, prune, and `allowEmpty` enabled. Removing an Application manifest from Git deletes the Application and cascades deletion to the resources it manages. Removing a resource from an Application's source prunes that resource, including when its source becomes empty. Longhorn disk configuration is applied to the Kubernetes Node objects, so deleting the Longhorn node manifests also prunes those Node objects; the kubelets may register them again while the machines remain joined to the cluster.

## Apply flow

Argo CD itself is bootstrapped by `infra/argocd/pulumi`. The root Application discovers project and application manifests recursively. Each child Application uses its matching AppProject; no application uses Argo CD's `default` project. Argo CD needs read access to this Git repository and the Longhorn, CloudNativePG, Infisical, Kyverno, and MinIO Helm repositories.

Keep each component together as a module. AppProjects live in `projects/<project>/`; each Application lives in `applications/<project>/<application>/application.yaml`; and that application's Helm values and raw manifests live under the matching `values/<project>/<application>/` directory. Use descriptive chart-value filenames when a module has multiple charts, and put raw Kubernetes resources in that module's `resources/` directory. For example:

```text
applications/
├── security/
│   ├── infisical/application.yaml
│   ├── infisical-secrets-operator/application.yaml
│   ├── infisical-secret-replication/application.yaml
│   ├── kyverno/application.yaml
│   └── security-namespace/application.yaml
└── storage/
    ├── cloudnative-pg-operator/application.yaml
    ├── longhorn/application.yaml
    ├── minio/application.yaml
    ├── postgresql-cluster/application.yaml
    └── redis/application.yaml

values/
├── security/
│   ├── infisical/values.yaml
│   ├── infisical-secrets-operator/values.yaml
│   ├── infisical-secret-replication/resources/
│   ├── kyverno/values.yaml and resources/
│   └── namespace/resources/
└── storage/
    ├── longhorn/values.yaml and resources/
    ├── minio/tenant-values.yaml and resources/
    ├── postgresql-cluster/resources/
    └── redis/resources/
```

Add networking, observability, or Cilium policy directories when their first real manifests are ready; empty placeholders are not needed. Put Cilium policies under `policies/cilium/`. Keep secret values out of committed plaintext files.
