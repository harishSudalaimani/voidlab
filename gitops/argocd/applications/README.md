# Argo CD applications

The Pulumi bootstrap root Application watches this directory recursively. Add one Argo CD `Application` manifest per deployment here. Each child Application should point to the corresponding workload manifests elsewhere in the repository, such as `platform/` or `apps/`.

Keep workload manifests out of this directory: the root Application applies resources found here into the `argocd` namespace. Use each child Application's destination to choose the workload namespace and cluster.
