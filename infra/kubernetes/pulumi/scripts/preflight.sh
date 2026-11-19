#!/usr/bin/env bash
set -euo pipefail

node_name="$1"
expected_ip="$2"
allow_single_cpu="$3"
node_addresses_csv="$4"

. /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  echo "${node_name}: expected Ubuntu 24.04; found ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

if [[ "$(hostname -s)" != "$node_name" ]]; then
  echo "${node_name}: hostname is $(hostname -s), expected ${node_name}" >&2
  exit 1
fi

if ! ip -o -4 address show | awk '{split($4, a, "/"); print a[1]}' | grep -Fxq "$expected_ip"; then
  echo "${node_name}: expected static address ${expected_ip} is not configured" >&2
  exit 1
fi

memory_mib="$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)"
minimum_memory_mib=3600
if [[ "$node_name" == "cp" ]]; then
  minimum_memory_mib=1800
  cpus="$(nproc)"
  if (( cpus < 2 )) && [[ "$allow_single_cpu" != "true" ]]; then
    echo "cp: kubeadm 1.37 recommends at least 2 CPUs; found ${cpus}. Resize cp to 2 vCPU, or explicitly set allowSingleCPUControlPlane=true to continue with the preflight exception." >&2
    exit 1
  fi
fi
if (( memory_mib < minimum_memory_mib )); then
  echo "${node_name}: expected at least ${minimum_memory_mib} MiB RAM; found ${memory_mib} MiB" >&2
  exit 1
fi

if [[ ! -e /sys/fs/cgroup/cgroup.controllers ]]; then
  echo "${node_name}: cgroup v2 is not active" >&2
  exit 1
fi

IFS=',' read -r -a node_addresses <<<"$node_addresses_csv"
for peer_ip in "${node_addresses[@]}"; do
  if [[ "$peer_ip" == "$expected_ip" ]]; then
    continue
  fi
  if ! timeout 3 bash -c "exec 3<>/dev/tcp/${peer_ip}/22" >/dev/null 2>&1; then
    echo "${node_name}: cannot reach peer ${peer_ip} on TCP 22; check the WireGuard routes and host forwarding" >&2
    exit 1
  fi
done

echo "${node_name}: Ubuntu 24.04, hostname, address, memory, cgroup, and six-node routing preflight passed"
