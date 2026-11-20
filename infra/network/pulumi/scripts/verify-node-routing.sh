#!/usr/bin/env bash
set -euo pipefail

node_name="$1"
node_ip="$2"
peer_ips_csv="$3"

if ! ip -o -4 address show | awk '{split($4, a, "/"); print a[1]}' | grep -Fxq "$node_ip"; then
  echo "${node_name}: expected static address ${node_ip} is not configured" >&2
  exit 1
fi

IFS=',' read -r -a peer_ips <<<"$peer_ips_csv"
checked_peers=0
for peer_ip in "${peer_ips[@]}"; do
  if [[ "$peer_ip" == "$node_ip" ]]; then
    continue
  fi
  if ! timeout 4 bash -c "exec 3<>/dev/tcp/${peer_ip}/22" >/dev/null 2>&1; then
    echo "${node_name}: cannot reach ${peer_ip} on TCP 22 across the VM network" >&2
    exit 1
  fi
  checked_peers=$((checked_peers + 1))
done

echo "${node_name}: static address and TCP 22 reachability to ${checked_peers} other nodes passed"
