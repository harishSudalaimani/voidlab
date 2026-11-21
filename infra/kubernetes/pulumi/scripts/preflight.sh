#!/usr/bin/env bash
set -euo pipefail

node_name="$1"
node_role="$2"
allow_single_cpu="$3"
peer_ip="$4"

. /etc/os-release
if [[ "${ID:-}" != "fedora" || "${VERSION_ID:-}" != "45" ]]; then
  echo "${node_name}: expected Fedora 45; found ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

if [[ "$(hostname -s)" != "$node_name" ]]; then
  hostnamectl set-hostname "$node_name"
fi

# Longhorn uses the existing XFS data mounts on the control plane and the
# worker's root filesystem. Refuse to create storage directories on root if a
# dedicated control-plane mount is missing.
if [[ "$node_role" == "control-plane" ]]; then
  for mount_path in /data/vms /storage; do
    if ! mountpoint -q "$mount_path"; then
      echo "${node_name}: required Longhorn data mount ${mount_path} is not mounted" >&2
      exit 1
    fi
  done
  install -d -m 0755 /data/vms/longhorn /data/vms/containerd /storage/longhorn
else
  install -d -m 0755 /var/lib/longhorn
fi

# Kubernetes 1.37 requires SELinux permissive mode unless the host has a
# custom policy for the kubelet and CNI.
if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce)" == "Enforcing" ]]; then
  setenforce 0
fi
if [[ -f /etc/selinux/config ]]; then
  sed -ri 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config
fi

# kubeadm runs before the separate network stack, so allow the control-plane
# and kubelet traffic needed to initialize and join both direct-connected nodes.
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  peer_interface="$(ip -4 route get "$peer_ip" | awk '{for (i=1; i<=NF; i++) if ($i == "dev") {print $(i+1); exit}}')"
  zone="$(firewall-cmd --get-zone-of-interface "$peer_interface" 2>/dev/null || true)"
  if [[ -z "$zone" ]]; then zone="$(firewall-cmd --get-default-zone)"; fi
  for port in 6443 10250; do
    rule="rule family=\"ipv4\" source address=\"${peer_ip}\" port port=\"${port}\" protocol=\"tcp\" accept"
    firewall-cmd --permanent --zone="$zone" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule" >/dev/null
  done
  firewall-cmd --reload >/dev/null
elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  for port in 6443 10250; do
    ufw allow proto tcp from "$peer_ip" to any port "$port"
  done
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

echo "${node_name}: Fedora 45, hostname, Longhorn storage paths, memory, CPU, cgroup, and peer firewall preflight passed"
