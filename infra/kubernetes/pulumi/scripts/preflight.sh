#!/usr/bin/env bash
set -euo pipefail

node_name="$1"
node_role="$2"
allow_single_cpu="$3"

. /etc/os-release
if [[ "${ID:-}" != "fedora" || "${VERSION_ID:-}" != "45" ]]; then
  echo "${node_name}: expected Fedora 45; found ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

if [[ "$(hostname -s)" != "$node_name" ]]; then
  hostnamectl set-hostname "$node_name"
fi

# Longhorn uses the existing XFS data mounts on the control plane. Refuse to
# create storage directories on root if either dedicated mount is missing.
if [[ "$node_role" == "control-plane" ]]; then
  for mount_path in /data/vms /storage; do
    if ! mountpoint -q "$mount_path"; then
      echo "${node_name}: required Longhorn data mount ${mount_path} is not mounted" >&2
      exit 1
    fi
  done
  install -d -m 0755 /data/vms/longhorn /data/vms/containerd /storage/longhorn
fi

# Kubernetes 1.37 requires SELinux permissive mode unless the host has a
# custom policy for the kubelet and CNI.
if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce)" == "Enforcing" ]]; then
  setenforce 0
fi
if [[ -f /etc/selinux/config ]]; then
  sed -ri 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config
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

echo "${node_name}: Fedora 45, hostname, Longhorn storage paths, memory, CPU, and cgroup preflight passed"
