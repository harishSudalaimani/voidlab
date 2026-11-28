#!/usr/bin/env bash
set -euo pipefail

local_ip="$1"
local_role="$2"
pod_cidr="$3"
lan_cidr="$4"

if [[ "$local_role" != "control-plane" ]]; then
  echo "Single-node cluster requires a control-plane server; got ${local_role}" >&2
  exit 1
fi

# The single-node path has no inter-node Cilium, kubelet, or VXLAN traffic.
# Allow in-cluster API and Hubble traffic to reach the control-plane host.
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  interface="$(ip -4 route show default | awk 'NR == 1 {print $5}')"
  zone="$(firewall-cmd --get-zone-of-interface "$interface" 2>/dev/null || true)"
  if [[ -z "$zone" || "$zone" == "no zone" ]]; then zone="$(firewall-cmd --get-default-zone)"; fi

  for port in 6443 4244; do
    rule="rule family=\"ipv4\" source address=\"${pod_cidr}\" destination address=\"${local_ip}\" port port=\"${port}\" protocol=\"tcp\" accept"
    firewall-cmd --permanent --zone="$zone" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule" >/dev/null
  done

  policy="lan-to-istio"
  if ! firewall-cmd --permanent --get-policies | tr ' ' '\n' | grep -Fxq "$policy"; then
    firewall-cmd --permanent --new-policy="$policy" >/dev/null
  fi
  firewall-cmd --permanent --policy="$policy" --query-ingress-zone="$zone" >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-ingress-zone="$zone" >/dev/null
  firewall-cmd --permanent --policy="$policy" --query-egress-zone=ANY >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-egress-zone=ANY >/dev/null
  for port in 80 443; do
    rule="rule family=\"ipv4\" source address=\"${lan_cidr}\" destination address=\"${pod_cidr}\" port port=\"${port}\" protocol=\"tcp\" accept"
    firewall-cmd --permanent --policy="$policy" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-rich-rule="$rule" >/dev/null
    input_rule="rule family=\"ipv4\" source address=\"${lan_cidr}\" port port=\"${port}\" protocol=\"tcp\" accept"
    if firewall-cmd --permanent --zone="$zone" --query-rich-rule="$input_rule" >/dev/null 2>&1; then
      firewall-cmd --permanent --zone="$zone" --remove-rich-rule="$input_rule" >/dev/null
    fi
    if firewall-cmd --permanent --zone="$zone" --query-port="${port}/tcp" >/dev/null 2>&1; then
      firewall-cmd --permanent --zone="$zone" --remove-port="${port}/tcp" >/dev/null
    fi
  done
  for protocol in tcp udp; do
    rule="rule family=\"ipv4\" source address=\"${lan_cidr}\" destination address=\"${pod_cidr}\" port port=\"53\" protocol=\"${protocol}\" accept"
    firewall-cmd --permanent --policy="$policy" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-rich-rule="$rule" >/dev/null
  done
  firewall-cmd --reload >/dev/null
elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  for port in 80 443; do
    ufw --force delete allow proto tcp from "$lan_cidr" to any port "$port" >/dev/null 2>&1 || true
    ufw --force delete allow "${port}/tcp" >/dev/null 2>&1 || true
    ufw route allow proto tcp from "$lan_cidr" to "$pod_cidr" port "$port"
  done
  ufw route allow proto tcp from "$lan_cidr" to "$pod_cidr" port 53
  ufw route allow proto udp from "$lan_cidr" to "$pod_cidr" port 53
  ufw allow proto tcp from "$pod_cidr" to "$local_ip" port 6443
  ufw allow proto tcp from "$pod_cidr" to "$local_ip" port 4244
fi

echo "Single-node host firewall configured for in-cluster API/Hubble access and LAN Gateway/DNS forwarding"
