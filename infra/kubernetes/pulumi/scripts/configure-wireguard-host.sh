#!/usr/bin/env bash
set -euo pipefail

local_subnet="$1"
peer_subnet="$2"
local_tunnel_address="$3"
peer_tunnel_address="$4"
peer_endpoint="$5"
peer_public_key="$6"
wireguard_interface=wg-voidlab
network_name=voidlab-network
wireguard_zone=voidlab-wg

if [[ ! "$peer_public_key" =~ ^[A-Za-z0-9+/]{43}=$ ]]; then
  echo "Invalid WireGuard peer public key" >&2
  exit 1
fi

private_key=/etc/wireguard/voidlab-privatekey
if [[ ! -s "$private_key" ]]; then
  echo "WireGuard private key is missing; run the host preparation step first" >&2
  exit 1
fi

bridge="$(virsh -c qemu:///system net-dumpxml "$network_name" | sed -n "s/.*<bridge name=['\"]\([^'\"]*\)['\"].*/\1/p" | head -n1)"
if [[ -z "$bridge" ]]; then
  echo "Could not find the libvirt bridge for ${network_name}" >&2
  exit 1
fi

install -d -m 0700 /etc/wireguard
umask 077
cat >"/etc/wireguard/${wireguard_interface}.conf" <<EOF
[Interface]
Address = ${local_tunnel_address}/30
ListenPort = 51820
PrivateKey = $(cat "$private_key")

[Peer]
PublicKey = ${peer_public_key}
Endpoint = ${peer_endpoint}:51820
AllowedIPs = ${peer_tunnel_address}/32, ${peer_subnet}
PersistentKeepalive = 25
EOF
chmod 0600 "/etc/wireguard/${wireguard_interface}.conf"

cat >/etc/sysctl.d/99-voidlab-wireguard.conf <<'EOF'
net.ipv4.ip_forward = 1
EOF
sysctl --system >&2

uplink="$(ip -4 route get "$peer_endpoint" | awk '{for (i=1; i<=NF; i++) if ($i == "dev") {print $(i+1); exit}}')"
if [[ -z "$uplink" ]]; then
  echo "Could not find the uplink interface for ${peer_endpoint}" >&2
  exit 1
fi
zone="$(firewall-cmd --get-zone-of-interface "$uplink" 2>/dev/null || true)"
if [[ -z "$zone" ]]; then
  zone="$(firewall-cmd --get-default-zone)"
fi
firewall-cmd --permanent --zone="$zone" --add-port=51820/udp >/dev/null

ensure_policy() {
  local policy="$1"
  local ingress_zone="$2"
  local egress_zone="$3"
  local source_subnet="$4"
  local destination_subnet="$5"
  local rich_rule="rule family=\"ipv4\" source address=\"${source_subnet}\" destination address=\"${destination_subnet}\" accept"

  if ! firewall-cmd --permanent --get-policies | tr ' ' '\n' | grep -Fxq "$policy"; then
    firewall-cmd --permanent --new-policy="$policy" >/dev/null
  fi
  firewall-cmd --permanent --policy="$policy" --set-target=DROP >/dev/null
  if ! firewall-cmd --permanent --policy="$policy" --query-ingress-zone="$ingress_zone" >/dev/null 2>&1; then
    firewall-cmd --permanent --policy="$policy" --add-ingress-zone="$ingress_zone" >/dev/null
  fi
  if ! firewall-cmd --permanent --policy="$policy" --query-egress-zone="$egress_zone" >/dev/null 2>&1; then
    firewall-cmd --permanent --policy="$policy" --add-egress-zone="$egress_zone" >/dev/null
  fi
  if ! firewall-cmd --permanent --policy="$policy" --query-rich-rule="$rich_rule" >/dev/null 2>&1; then
    firewall-cmd --permanent --policy="$policy" --add-rich-rule="$rich_rule" >/dev/null
  fi
}

if ! firewall-cmd --permanent --get-zones | tr ' ' '\n' | grep -Fxq "$wireguard_zone"; then
  firewall-cmd --permanent --new-zone="$wireguard_zone" >/dev/null
fi
firewall-cmd --permanent --zone="$wireguard_zone" --set-target=DROP >/dev/null
peer_tunnel_host="${peer_tunnel_address}/32"
icmp_rule="rule family=\"ipv4\" source address=\"${peer_tunnel_host}\" protocol value=\"icmp\" accept"
if ! firewall-cmd --permanent --zone="$wireguard_zone" --query-rich-rule="$icmp_rule" >/dev/null 2>&1; then
  firewall-cmd --permanent --zone="$wireguard_zone" --add-rich-rule="$icmp_rule" >/dev/null
fi
if ! firewall-cmd --permanent --zone="$wireguard_zone" --query-interface="$wireguard_interface" >/dev/null 2>&1; then
  firewall-cmd --permanent --zone="$wireguard_zone" --add-interface="$wireguard_interface" >/dev/null
fi

# Permit only the routed VM subnet pair between the WireGuard and libvirt zones.
ensure_policy vl-wg-lib "$wireguard_zone" libvirt "$peer_subnet" "$local_subnet"
ensure_policy vl-lib-wg libvirt "$wireguard_zone" "$local_subnet" "$peer_subnet"

# Remove the former direct rules. They live in a separate nftables base chain,
# so their ACCEPT verdict cannot override libvirt's own guest_input reject.
remove_direct_rule() {
  if firewall-cmd --permanent --direct --query-rule "$@" >/dev/null 2>&1; then
    firewall-cmd --permanent --direct --remove-rule "$@" >/dev/null
  fi
}
remove_direct_rule ipv4 nat POSTROUTING 0 -s "$local_subnet" -d "$peer_subnet" -j ACCEPT
remove_direct_rule ipv4 filter FORWARD 0 -i "$bridge" -o "$wireguard_interface" -s "$local_subnet" -d "$peer_subnet" -j ACCEPT
remove_direct_rule ipv4 filter FORWARD 0 -i "$wireguard_interface" -o "$bridge" -s "$peer_subnet" -d "$local_subnet" -j ACCEPT

systemctl enable "wg-quick@${wireguard_interface}" >/dev/null
if systemctl is-active --quiet "wg-quick@${wireguard_interface}"; then
  systemctl restart "wg-quick@${wireguard_interface}"
else
  systemctl start "wg-quick@${wireguard_interface}"
fi

firewall-cmd --reload >/dev/null
current_zone="$(firewall-cmd --get-zone-of-interface "$wireguard_interface" 2>/dev/null || true)"
if [[ "$current_zone" != "$wireguard_zone" ]]; then
  firewall-cmd --zone="$wireguard_zone" --change-interface="$wireguard_interface" >/dev/null
fi

ip route get "${peer_subnet%%/*}" | grep -q "dev ${wireguard_interface}"
echo "WireGuard routes ${peer_subnet} through ${wireguard_interface}; firewalld policies allow only ${local_subnet} <-> ${peer_subnet}"
