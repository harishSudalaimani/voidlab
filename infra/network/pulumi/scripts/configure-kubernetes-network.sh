#!/usr/bin/env bash
set -euo pipefail

local_ip="$1"
peer_ip="$2"
local_role="$3"
peer_role="$4"
pod_cidr="$5"
lan_cidr="$6"

if [[ "$local_role:$peer_role" != "control-plane:worker" && "$local_role:$peer_role" != "worker:control-plane" ]]; then
  echo "Expected one control-plane and one worker; got ${local_role} and ${peer_role}" >&2
  exit 1
fi

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
  if [[ "$local_role" == "control-plane" ]]; then
    rule="rule family=\"ipv4\" source address=\"${pod_cidr}\" destination address=\"${local_ip}\" port port=\"6443\" protocol=\"tcp\" accept"
    firewall-cmd --permanent --zone="$zone" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule" >/dev/null
  fi
  for source in "$peer_ip" "$pod_cidr"; do
    rule="rule family=\"ipv4\" source address=\"${source}\" destination address=\"${local_ip}\" port port=\"4244\" protocol=\"tcp\" accept"
    firewall-cmd --permanent --zone="$zone" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule" >/dev/null
  done
  if [[ "$local_role" == "control-plane" ]]; then
    # Gateway VIP traffic is forwarded by Cilium to a pod IP. Host input
    # rules (or opening the ports on the node) do not permit that path.
    policy="lan-to-istio"
    if ! firewall-cmd --permanent --get-policies | tr ' ' '\n' | grep -Fxq "$policy"; then
      firewall-cmd --permanent --new-policy="$policy" >/dev/null
    fi
    firewall-cmd --permanent --policy="$policy" --query-ingress-zone="$zone" >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-ingress-zone="$zone" >/dev/null
    firewall-cmd --permanent --policy="$policy" --query-egress-zone=ANY >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-egress-zone=ANY >/dev/null
    for port in 80 443; do
      rule="rule family=\"ipv4\" source address=\"${lan_cidr}\" destination address=\"${pod_cidr}\" port port=\"${port}\" protocol=\"tcp\" accept"
      firewall-cmd --permanent --policy="$policy" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-rich-rule="$rule" >/dev/null

      # Remove both the previous LAN-only host-input rules and broad port
      # openings created by earlier versions of this script.
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
  fi
  rule="rule family=\"ipv4\" source address=\"${peer_ip}\" destination address=\"${local_ip}\" port port=\"8472\" protocol=\"udp\" accept"
  firewall-cmd --permanent --zone="$zone" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule" >/dev/null
  firewall-cmd --reload >/dev/null
elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  for port in 6443 10250 4240; do
    ufw allow proto tcp from "$peer_ip" to "$local_ip" port "$port"
  done
  if [[ "$local_role" == "control-plane" ]]; then
    ufw allow proto tcp from "$pod_cidr" to "$local_ip" port 6443
  fi
  ufw allow proto tcp from "$peer_ip" to "$local_ip" port 4244
  ufw allow proto tcp from "$pod_cidr" to "$local_ip" port 4244
  ufw allow proto udp from "$peer_ip" to "$local_ip" port 8472
  if [[ "$local_role" == "control-plane" ]]; then
    for port in 80 443; do
      # Remove old host-input rules; this traffic must be routed to the
      # Gateway pod CIDR. Ignore missing rules to keep reconciliation safe.
      ufw --force delete allow proto tcp from "$lan_cidr" to any port "$port" >/dev/null 2>&1 || true
      ufw --force delete allow "${port}/tcp" >/dev/null 2>&1 || true
      ufw route allow proto tcp from "$lan_cidr" to "$pod_cidr" port "$port"
    done
    ufw route allow proto tcp from "$lan_cidr" to "$pod_cidr" port 53
    ufw route allow proto udp from "$lan_cidr" to "$pod_cidr" port 53
  fi
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
