#!/usr/bin/env bash
set -euo pipefail

expected_nodes="$1"
if [[ ! "$expected_nodes" =~ ^[1-9][0-9]*$ ]]; then
  echo "Expected node count must be a positive integer" >&2
  exit 1
fi
for attempt in $(seq 1 120); do
  node_count="$(kubectl --kubeconfig=/etc/kubernetes/admin.conf get nodes --no-headers 2>/dev/null | wc -l)"
  if (( node_count >= expected_nodes )); then
    break
  fi
  sleep 2
done

if (( node_count < expected_nodes )); then
  echo "Expected at least ${expected_nodes} Kubernetes nodes, found ${node_count}" >&2
  exit 1
fi

# The CNI is installed by the separate CNI Pulumi project. Nodes stay
# NotReady until that stack installs it, so bootstrap waits only for kubelet
# registration and kubeconfig export.
kubectl --kubeconfig=/etc/kubernetes/admin.conf get nodes -o wide
