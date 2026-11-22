# VoidLab GitOps

## Current scope

GitOps deploys Longhorn, Sealed Secrets, and Infisical in sequence. Pulumi bootstraps Argo CD, the `bootstrap` AppProject, and the root Application. The root Application reads project and child Application manifests from this directory.

Longhorn uses the `storage` AppProject and sync wave `0`. Sealed Secrets uses the `security` AppProject and sync wave `1`. Infisical uses the `security` project and sync wave `2`. Store the Infisical bootstrap credentials as an encrypted `SealedSecret` named `infisical-secrets` in Git. Sealed Secrets creates the Kubernetes Secret with that same name for Infisical. Never commit the plaintext Secret.

Infisical uses the official `infisical-standalone` chart with its bundled PostgreSQL and Redis dependencies enabled. These are part of the Infisical Application, not separate platform apps. Infisical, PostgreSQL, and Redis are pinned to `cp`; their persistent data uses Longhorn. Ingress and the chart's bundled ingress controller are disabled; use `kubectl -n security port-forward svc/infisical 8081:8080` and open `http://localhost:8081` for initial setup.

### Infisical bootstrap secret

Do not create the live Secret with `kubectl create`. After the Sealed Secrets controller is healthy, create an encrypted manifest locally and commit it. `--dry-run=client` keeps the plaintext out of the cluster; only the encrypted `SealedSecret` is written to Git:

```sh
kubectl -n security create secret generic infisical-secrets \
  --dry-run=client -o yaml \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=ENCRYPTION_KEY="$(openssl rand -hex 16)" \
  --from-literal=SITE_URL="http://localhost:8081" |
kubeseal --controller-name sealed-secrets-controller \
  --controller-namespace kube-system --format yaml \
  > gitops/values/security/infisical/resources/infisical-secrets.yaml
```

Commit and push that encrypted file. Sealed Secrets creates `security/infisical-secrets`, and Infisical reads it directly. Back up the Sealed Secrets private key securely outside Git so the encrypted manifest remains recoverable after cluster loss.

Longhorn control components are pinned to `cp`; Longhorn's node manager and storage workloads run on both configured storage nodes (`cp` and `worker`). The default StorageClass uses two replicas.

Longhorn stores data on `cp`'s `/data/vms/longhorn` SSD and `/storage/longhorn` HDD mounts, and on `worker`'s `/var/lib/longhorn` root filesystem. With two replicas and node-level replica anti-affinity, the worker root disk is the capacity limit; usable volume capacity is much lower than the sum of all three disks. Disk scheduling keeps a 15% free-space threshold, but this is not a hard cap for snapshot growth or volume writes, so monitor disk usage and leave host space available. The Longhorn Node annotation configures disks when Longhorn first discovers a node; it does not rewrite disks already present in Longhorn's Node resources.

The bundled PostgreSQL and Redis instances are single-instance proof-of-concept dependencies, not HA services. Add other shared data services or application workloads later as separate GitOps Applications after this phase is confirmed healthy.

## Pruning

Child Applications use automated sync, self-heal, prune, `allowEmpty`, and Argo CD's resources finalizer. Removing an Application manifest from Git removes the Application and cascades deletion to resources it manages. Removing a resource from an Application source prunes that resource.

Removing an Application manifest from Git prunes its managed resources. PersistentVolume and data deletion depends on each volume's reclaim policy.

## Structure

Keep each component in the existing project/application/values layout:

```text
applications/
├── security/infisical/application.yaml
├── security/sealed-secrets/application.yaml
└── storage/longhorn/application.yaml

projects/
├── bootstrap/bootstrap.yaml
├── security/security.yaml
└── storage/storage.yaml

values/
├── security/infisical/values.yaml and resources/
├── security/sealed-secrets/values.yaml
└── storage/longhorn/values.yaml and resources/
```

Helm values and component manifests stay under `values/<project>/<application>/`. AppProjects and child Applications stay under `projects/` and `applications/`. Do not commit secret values as plaintext.
