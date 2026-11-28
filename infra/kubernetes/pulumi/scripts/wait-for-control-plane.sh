#!/usr/bin/env bash
set -euo pipefail

for attempt in $(seq 1 120); do
  if kubectl --kubeconfig=/etc/kubernetes/admin.conf get node cp --no-headers >/dev/null 2>&1; then
    kubectl --kubeconfig=/etc/kubernetes/admin.conf get node cp -o wide
    exit 0
  fi
  sleep 2
done

echo "Control-plane node cp did not register with the API server" >&2
exit 1
