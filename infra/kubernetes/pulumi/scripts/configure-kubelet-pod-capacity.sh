#!/usr/bin/env bash
set -euo pipefail

max_pods="${1:?max pods is required}"
if [[ ! "$max_pods" =~ ^[1-9][0-9]*$ ]]; then
  echo "max pods must be a positive integer" >&2
  exit 1
fi

kubelet_config=/var/lib/kubelet/config.yaml
if [[ ! -s "$kubelet_config" ]]; then
  echo "kubelet config not found at ${kubelet_config}" >&2
  exit 1
fi

if grep -Eq "^maxPods:[[:space:]]*${max_pods}[[:space:]]*$" "$kubelet_config"; then
  if ! systemctl is-active --quiet kubelet; then
    systemctl restart kubelet
  fi
  echo "kubelet maxPods is already ${max_pods}"
  exit 0
fi

backup="${kubelet_config}.voidlab-backup"
if [[ ! -e "$backup" ]]; then
  cp -a "$kubelet_config" "$backup"
fi

if grep -q '^maxPods:' "$kubelet_config"; then
  sed -ri "s/^maxPods:.*/maxPods: ${max_pods}/" "$kubelet_config"
else
  printf '\nmaxPods: %s\n' "$max_pods" >> "$kubelet_config"
fi

if ! systemctl restart kubelet || ! systemctl is-active --quiet kubelet; then
  echo "kubelet did not remain active after applying maxPods=${max_pods}" >&2
  cp -a "$backup" "$kubelet_config"
  systemctl restart kubelet || true
  exit 1
fi

echo "Configured kubelet maxPods=${max_pods}"
