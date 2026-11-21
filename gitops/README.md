# VoidLab GitOps

Argo CD manages platform projects, application definitions, and cluster policies from this directory. `bootstrap/root-application.yaml` uses the `bootstrap` AppProject. Networking, security, storage, and observability each have their own AppProject under `projects/<project>/`; applications use the matching project and never Argo CD's built-in `default` project. The root Application includes YAML under `projects/`, `applications/`, and `policies/`. Helm values under `values/` are read by child Applications and are not applied directly.

## Storage

The `storage` project deploys Longhorn to the worker nodes and a MinIO tenant constrained to `worker-1` and `worker-2`. Longhorn's default `longhorn` StorageClass uses three replicas for general workloads. MinIO uses a separate `longhorn-minio` StorageClass with two replicas, and Longhorn disk and node tags restrict those volumes to the two 800 GB HDDs.

The MinIO tenant has four server pods, normally spread across the two HDD workers, with two 80 GiB PVCs per pod. The PVC requests total 640 GiB; Longhorn keeps two copies, one on each HDD, leaving capacity for filesystem overhead and recovery. The tenant is constrained to worker-1 and worker-2 but may move to the surviving worker if one goes down. Both hosts remain a shared failure domain.

### Worker disk preparation

Before syncing the storage Applications, install and enable the Longhorn node prerequisites on all workers, including `open-iscsi`/`iscsid`. Prepare `/dev/vdb` on `worker-1` and `worker-2` as a filesystem and mount it persistently at `/var/lib/longhorn/`. Confirm the disks contain no data that must be kept before formatting them. The Longhorn node annotations in `values/storage/longhorn-resources/nodes.yaml` initialize the 800 GB mounts as `minio-hdd` disks; worker-3 and worker-4 use their root filesystems with 30 GiB reserved. Longhorn components run on all workers, while MinIO storage is constrained by node and disk tags to the two HDDs.

The MinIO tenant chart expects a Secret named `minio-env-configuration` in `minio-tenant`, containing the key `config.env` with `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` exports. Supply it through the secrets platform before the tenant starts; credentials are intentionally not committed. The storage AppProject explicitly permits the namespaces and cluster-scoped resources required by Longhorn and the MinIO operator.

The MinIO operator chart is pinned to `7.1.1`. Its upstream repository was archived in March 2026, so this pin will not receive upstream operator maintenance. Review that lifecycle before using the tenant for important data.

## Apply flow

Argo CD itself is bootstrapped by `infra/argocd/pulumi`. The root Application creates the `storage` AppProject and the Longhorn and MinIO Applications from this repository. Argo CD needs read access to this Git repository, the Longhorn Helm repository, and the MinIO operator Helm repository.

Put each AppProject in `projects/<project>/`, Applications in `applications/<project>/`, Helm values and app-specific manifests in `values/<project>/`, and Cilium policies under `policies/cilium/`. Keep secrets out of committed values files.
