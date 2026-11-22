# VoidLab GitOps

## Current scope

GitOps is in its first phase: only Longhorn and Kyverno are deployed by child Applications. Pulumi bootstraps Argo CD, the `bootstrap` AppProject, and the root Application. The root Application reads project and child Application manifests from this directory.

Longhorn uses the `storage` AppProject and sync wave `0`. Kyverno uses the `security` AppProject and sync wave `1`, so Argo CD applies Kyverno after Longhorn becomes healthy. Longhorn control components and Kyverno workloads are pinned to `cp`; Longhorn's node manager and storage workloads run on both configured storage nodes (`cp` and `worker`). The default StorageClass uses two replicas.

Longhorn stores data on `cp`'s `/data/vms/longhorn` SSD and `/storage/longhorn` HDD mounts, and on `worker`'s `/var/lib/longhorn` root filesystem. With two replicas and node-level replica anti-affinity, the worker root disk is the capacity limit; usable volume capacity is much lower than the sum of all three disks. Disk scheduling keeps a 15% free-space threshold, but this is not a hard cap for snapshot growth or volume writes, so monitor disk usage and leave host space available. The Longhorn Node annotation configures disks when Longhorn first discovers a node; it does not rewrite disks already present in Longhorn's Node resources.

No databases, Redis, Infisical, MinIO, or application workloads are declared in this phase. Add each later as a separate GitOps Application after Longhorn and Kyverno are confirmed healthy.

## Pruning

Child Applications use automated sync, self-heal, prune, `allowEmpty`, and Argo CD's resources finalizer. Removing an Application manifest from Git removes the Application and cascades deletion to resources it manages. Removing a resource from an Application source prunes that resource.

Pushing this phase reset will therefore prune the previously declared CloudNativePG, PostgreSQL, Redis, Infisical, and MinIO Applications and their managed resources. PersistentVolume and data deletion depends on each volume's reclaim policy.

## Structure

Keep each component in the existing project/application/values layout:

```text
applications/
├── security/kyverno/application.yaml
└── storage/longhorn/application.yaml

projects/
├── bootstrap/bootstrap.yaml
├── security/security.yaml
└── storage/storage.yaml

values/
├── security/kyverno/values.yaml and resources/
└── storage/longhorn/values.yaml and resources/
```

Helm values and component manifests stay under `values/<project>/<application>/`. AppProjects and child Applications stay under `projects/` and `applications/`. Do not commit secret values as plaintext.
