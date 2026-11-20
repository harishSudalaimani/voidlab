#!/usr/bin/env bash
set -euo pipefail

node_name="$1"
node_role="$2"
allow_single_cpu="$3"

. /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  echo "${node_name}: expected Ubuntu 24.04; found ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

if [[ "$(hostname -s)" != "$node_name" ]]; then
  echo "${node_name}: hostname is $(hostname -s), expected ${node_name}" >&2
  exit 1
fi

memory_mib="$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)"
minimum_memory_mib=3600
if [[ "$node_role" == "control-plane" ]]; then
  minimum_memory_mib=1800
  cpus="$(nproc)"
  if (( cpus < 2 )) && [[ "$allow_single_cpu" != "true" ]]; then
    echo "${node_name}: kubeadm 1.37 recommends at least 2 CPUs for the control plane; found ${cpus}. Resize it to 2 vCPU, or explicitly set allowSingleCPUControlPlane=true to continue with the preflight exception." >&2
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

echo "${node_name}: Ubuntu 24.04, hostname, memory, CPU, and cgroup preflight passed"
