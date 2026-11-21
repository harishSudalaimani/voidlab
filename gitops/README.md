# VoidLab GitOps

Argo CD manages platform projects, application definitions, and cluster policies from this directory. `bootstrap/root-application.yaml` is the declarative copy of the root Application created by `infra/argocd/pulumi`; it uses the `bootstrap` AppProject, which Pulumi creates before the root app on first install and GitOps reconciles from `projects/bootstrap/bootstrap.yaml`. Networking, security, storage, and observability each have their own AppProject under `projects/<project>/`; applications must use the matching project and must not use Argo CD's built-in `default` project. The root directory Application includes only YAML under `projects/`, `applications/`, and `policies/`. Helm values under `values/` are read by child Applications and are not applied as Kubernetes resources.

The first workload is Rook Ceph in `applications/storage/rook-ceph.yaml`. The application pins both official Rook charts to `1.21.2` and reads their values from `values/storage/rook-ceph.yaml`. It installs the operator and Ceph cluster charts in one Argo CD Application so Argo can order the chart CRDs before the Ceph custom resources.

## Storage layout

The current VM inventory attaches raw 800 GiB VirtIO data disks as `/dev/vdb` to `worker-1` and `worker-2`. The Ceph configuration names only those two nodes and devices; the OS disks and `worker-3`/`worker-4` are excluded. Before syncing Rook for the first time, verify both devices are empty and have no partitions or filesystems. Rook will initialize the selected raw disks for OSD use.

The initial cluster uses three monitors across Kubernetes workers, two managers, and one replicated RBD block pool with two replicas across hosts. The `ceph-block` StorageClass is the default. CephFS and the S3 object store are disabled until their placement and capacity requirements are decided. With only two OSD hosts, the pool has no third failure domain; a host failure leaves it degraded and without a second surviving copy.

Do not remove the Ceph cluster configuration or the Rook Application to perform a routine upgrade. The chart leaves `cleanupPolicy.confirmation` empty, so uninstall does not authorize disk sanitization. Deleting Ceph resources can still interrupt or remove access to persistent volumes, and the raw devices retain Ceph metadata. Review Rook's teardown procedure before intentionally removing the cluster.

## Apply flow

Argo CD itself remains bootstrapped by `infra/argocd/pulumi`. After the Argo CD root Application is updated to watch `gitops`, it creates the `storage` AppProject and then the Rook Ceph Application from this repository. Argo CD needs read access to this Git repository and to the public Rook Helm repository.

Future platform applications should go under `applications/<project>/`; put each AppProject in `projects/<project>/`, values in `values/<project>/`, and Cilium policy manifests under `policies/cilium/`. Keep secrets out of committed values files; introduce an approved secrets integration before a workload requires secret values.

## References

- [Rook v1.21.2 release](https://github.com/rook/rook/releases/tag/v1.21.2)
- [Rook operator Helm chart](https://rook.io/docs/rook/v1.21/Helm-Charts/operator-chart/)
- [Rook Ceph cluster Helm chart](https://rook.io/docs/rook/v1.21/Helm-Charts/ceph-cluster-chart/)
- [Rook prerequisites and raw device requirements](https://rook.io/docs/rook/v1.21/Getting-Started/Prerequisites/prerequisites/)
- [Rook CephCluster device selection](https://rook.io/docs/rook/v1.21/CRDs/Cluster/ceph-cluster-crd/)
- [Argo CD multi-source Applications](https://argo-cd.readthedocs.io/en/stable/user-guide/multiple_sources/)
- [Argo CD sync ordering](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/)
