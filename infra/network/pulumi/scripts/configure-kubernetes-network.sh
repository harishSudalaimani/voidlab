#!/usr/bin/env bash
set -euo pipefail

local_ip="$1"
peer_ip="$2"
peer_role="$3"
pod_cidr="$4"

route="$(ip -4 route get "$peer_ip")"
if [[ -z "$route" ]]; then
  echo "No direct route from this server to Kubernetes peer ${peer_ip}" >&2
  exit 1
fi

# Permit peer-to-peer Kubernetes, Cilium health/VXLAN, and Hubble traffic.
# Hubble Relay also connects from the cluster pod CIDR to each node's server.
# Other firewalls and router ACLs must allow the same direct traffic.
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  interface="$(awk '{for (i=1; i<=NF; i++) if ($i == "dev") {print $(i+1); exit}}' <<<"$route")"
  zone="$(firewall-cmd --get-zone-of-interface "$interface" 2>/dev/null || true)"
  if [[ -z "$zone" ]]; then zone="$(firewall-cmd --get-default-zone)"; fi
  for port in 6443 10250 4240; do
    rule="rule family=\"ipv4\" source address=\"${peer_ip}\" port port=\"${port}\" protocol=\"tcp\" accept"
    firewall-cmd --permanent --zone="$zone" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule" >/dev/null
  done
  for source in "$peer_ip" "$pod_cidr"; do
    rule="rule family=\"ipv4\" source address=\"${source}\" destination address=\"${local_ip}\" port port=\"4244\" protocol=\"tcp\" accept"
    firewall-cmd --permanent --zone="$zone" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule" >/dev/null
  done
  rule="rule family=\"ipv4\" source address=\"${peer_ip}\" destination address=\"${local_ip}\" port port=\"8472\" protocol=\"udp\" accept"
  firewall-cmd --permanent --zone="$zone" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule" >/dev/null
  firewall-cmd --reload >/dev/null
elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  for port in 6443 10250 4240; do
    ufw allow proto tcp from "$peer_ip" to "$local_ip" port "$port"
  done
  ufw allow proto tcp from "$peer_ip" to "$local_ip" port 4244
  ufw allow proto tcp from "$pod_cidr" to "$local_ip" port 4244
  ufw allow proto udp from "$peer_ip" to "$local_ip" port 8472
fi

# Verify the Kubernetes listener on the other server. Kubernetes bootstrap
# itself already needs node-to-node traffic before this stack is applied.
peer_port=10250
if [[ "$peer_role" == "control-plane" ]]; then
  peer_port=6443
elif [[ "$peer_role" != "worker" ]]; then
  echo "Unknown Kubernetes peer role: ${peer_role}" >&2
  exit 1
fi
if ! timeout 4 bash -c "exec 3<>/dev/tcp/${peer_ip}/${peer_port}" >/dev/null 2>&1; then
  echo "Cannot reach ${peer_role} peer ${peer_ip} on TCP/${peer_port} over the direct network" >&2
  exit 1
fi

echo "Direct route to ${peer_role} peer ${peer_ip} verified; peer-specific firewall rules applied when a host firewall is active"
