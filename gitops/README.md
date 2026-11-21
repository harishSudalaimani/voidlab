# VoidLab GitOps

Argo CD manages platform projects, application definitions, and cluster policies from this directory. `bootstrap/root-application.yaml` uses the `bootstrap` AppProject. Networking, security, storage, and observability each have their own AppProject under `projects/<project>/`; applications use the matching project and never Argo CD's built-in `default` project. The root Application includes YAML under `projects/`, `applications/`, and `policies/`. Helm values under `values/` are read by child Applications and are not applied directly.

## Storage and platform deployment order

Argo CD applies child Applications in sync-wave order and waits for each Application to become Healthy before starting the next wave:

1. Longhorn (`storage`, wave 0)
2. CloudNativePG operator (`storage`, wave 1)
3. CloudNativePG cluster for Infisical (`storage`, wave 2)
4. Redis prerequisite (`security`, wave 3)
5. Self-hosted Infisical (`security`, wave 4)
6. Infisical Secrets Operator (`security`, wave 5)
7. MinIO (`storage`, wave 6, currently paused)

The ordering depends on Application and CloudNativePG Cluster health checks enabled in the Argo CD Helm values managed by `infra/argocd/pulumi`. Apply the Argo CD Pulumi update before relying on these waves. The CloudNativePG Cluster check waits for its `Ready=True` condition, so Infisical does not start until its database is ready.

Longhorn's default `longhorn` StorageClass uses three replicas for general workloads. Its pre-upgrade chart hook is disabled because that hook runs before the service account exists on a fresh Argo CD install; this is the cause of the reported `longhorn-pre-upgrade` service-account failure. The setting is in `values/storage/longhorn.yaml`.

### Longhorn worker disk preparation

Before syncing Longhorn, install and enable its node prerequisites on all workers, including `open-iscsi`/`iscsid`. Prepare `/dev/vdb` on `worker-1` and `worker-2` as a filesystem and mount it persistently at `/var/lib/longhorn/`. Confirm those disks have no data to keep before formatting. The Longhorn node annotations in `values/storage/longhorn-resources/nodes.yaml` initialize the two 800 GB HDD mounts as `minio-hdd`; worker-3 and worker-4 use their root filesystems with 30 GiB reserved. Longhorn components run on all workers.

### CloudNativePG and self-hosted Infisical

The storage project installs CloudNativePG chart `0.29.2` (operator `1.30.2`) and creates a two-instance PostgreSQL cluster in the `infisical` namespace, using Longhorn volumes. The Infisical Helm chart uses that cluster and its generated `infisical-db-app` connection URI. A separate Redis StatefulSet provides Infisical's required Redis service, stores its data on Longhorn, and accepts connections only from Infisical pods through a Kubernetes NetworkPolicy. PostgreSQL backups are not configured yet; add an S3-compatible backup destination after MinIO is resumed or another target is chosen.

The infrastructure code currently selects Kubernetes `1.37`. CloudNativePG `1.30.x` lists Kubernetes `1.34`–`1.36` as supported and `1.37` as tested, but not supported. The pinned operator is the latest stable release at this revision, but that Kubernetes support caveat still applies.

Before the Infisical Application can become healthy, provide an `infisical-secrets` Secret in namespace `infisical` with `ENCRYPTION_KEY`, `AUTH_SECRET`, and `SITE_URL`. These values must be bootstrapped outside the Infisical instance itself; it cannot provide its own initial credentials. Keep them out of plaintext Git. The Infisical web endpoint currently stays internal (`ClusterIP`, no ingress) until a public/internal host and TLS route are chosen.

The Infisical Secrets Operator is configured to connect to the self-hosted service through cluster DNS and is applied only after Infisical is healthy. MinIO's Application has automated sync disabled at your request; its current resources are left in place if already installed. Do not manually sync MinIO until its `minio-env-configuration` secret source is configured.

## Apply flow

Argo CD itself is bootstrapped by `infra/argocd/pulumi`. The child Applications are created from this repository, each assigned to its matching AppProject; no application uses Argo CD's `default` project. Argo CD needs read access to this Git repository and the Longhorn, CloudNativePG, Infisical, and MinIO Helm repositories.

Put each AppProject in `projects/<project>/`, Applications in `applications/<project>/`, Helm values and app-specific manifests in `values/<project>/`, and Cilium policies under `policies/cilium/`. Keep secret values out of committed plaintext files.
