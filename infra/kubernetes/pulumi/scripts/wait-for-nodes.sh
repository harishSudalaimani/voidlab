#!/usr/bin/env bash
set -euo pipefail

expected_nodes=4
for attempt in $(seq 1 120); do
  node_count="$(kubectl --kubeconfig=/etc/kubernetes/admin.conf get nodes --no-headers 2>/dev/null | wc -l)"
  if (( node_count >= expected_nodes )); then
    break
  fi
  sleep 2
done

if (( node_count < expected_nodes )); then
  echo "Expected ${expected_nodes} Kubernetes nodes, found ${node_count}" >&2
  exit 1
fi

kubectl --kubeconfig=/etc/kubernetes/admin.conf wait \
  --for=condition=Ready nodes --all --timeout=15m
kubectl --kubeconfig=/etc/kubernetes/admin.conf get nodes -o wide
