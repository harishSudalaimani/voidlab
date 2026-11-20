#!/usr/bin/env bash
set -euo pipefail

local_subnet="$1"
local_tunnel_address="$2"
network_name="$3"
wireguard_interface="$4"
peer_specs="$5"
remote_subnets_csv="$6"
tunnel_cidr="$7"
wireguard_zone=voidlab-wg
private_key=/etc/wireguard/voidlab-privatekey

if [[ ! -s "$private_key" ]]; then
  echo "WireGuard private key is missing; run the host preparation step first" >&2
  exit 1
fi
if [[ ! "$local_subnet" =~ ^[0-9.]+/[0-9]+$ || ! "$tunnel_cidr" =~ ^[0-9.]+/[0-9]+$ ]]; then
  echo "Expected IPv4 CIDR values" >&2
  exit 1
fi

bridge="$(virsh -c qemu:///system net-dumpxml "$network_name" | sed -n "s/.*<bridge name=['\"]\([^'\"]*\)['\"].*/\1/p" | head -n1)"
if [[ -z "$bridge" ]]; then
  echo "Could not find the libvirt bridge for ${network_name}" >&2
  exit 1
fi

install -d -m 0700 /etc/wireguard
umask 077
config="/etc/wireguard/${wireguard_interface}.conf"
{
  printf '[Interface]\nAddress = %s/%s\nListenPort = 51820\nPrivateKey = %s\n' "$local_tunnel_address" "${tunnel_cidr##*/}" "$(cat "$private_key")"
  if [[ -n "$peer_specs" ]]; then
    IFS=';' read -r -a peers <<<"$peer_specs"
    for peer in "${peers[@]}"; do
      IFS='|' read -r public_key endpoint allowed_ips <<<"$peer"
      if [[ ! "$public_key" =~ ^[A-Za-z0-9+/]{43}=$ || -z "$allowed_ips" ]]; then
        echo "Invalid WireGuard peer entry" >&2
        exit 1
      fi
      printf '\n[Peer]\nPublicKey = %s\nAllowedIPs = %s\n' "$public_key" "$allowed_ips"
      if [[ -n "$endpoint" ]]; then
        printf 'Endpoint = %s\nPersistentKeepalive = 25\n' "$endpoint"
      fi
    done
  fi
} >"$config"
chmod 0600 "$config"

cat >/etc/sysctl.d/99-voidlab-wireguard.conf <<'EOF'
net.ipv4.ip_forward = 1
EOF
sysctl --system >&2

if ! firewall-cmd --state >/dev/null 2>&1; then
  echo "firewalld must be active on the hypervisor" >&2
  exit 1
fi
uplink="$(ip -4 route show default | awk 'NR == 1 {for (i=1; i<=NF; i++) if ($i == "dev") {print $(i+1); exit}}')"
if [[ -z "$uplink" ]]; then
  echo "Could not identify the hypervisor uplink interface" >&2
  exit 1
fi
zone="$(firewall-cmd --get-zone-of-interface "$uplink" 2>/dev/null || true)"
if [[ -z "$zone" ]]; then zone="$(firewall-cmd --get-default-zone)"; fi
firewall-cmd --permanent --zone="$zone" --add-port=51820/udp >/dev/null

ensure_policy() {
  local policy="$1" ingress_zone="$2" egress_zone="$3" source="$4" destination="$5"
  local rule="rule family=\"ipv4\" source address=\"${source}\" destination address=\"${destination}\" accept"
  if ! firewall-cmd --permanent --get-policies | tr ' ' '\n' | grep -Fxq "$policy"; then
    firewall-cmd --permanent --new-policy="$policy" >/dev/null
  fi
  firewall-cmd --permanent --policy="$policy" --set-target=DROP >/dev/null
  firewall-cmd --permanent --policy="$policy" --query-ingress-zone="$ingress_zone" >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-ingress-zone="$ingress_zone" >/dev/null
  firewall-cmd --permanent --policy="$policy" --query-egress-zone="$egress_zone" >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-egress-zone="$egress_zone" >/dev/null
  firewall-cmd --permanent --policy="$policy" --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --policy="$policy" --add-rich-rule="$rule" >/dev/null
}

firewall-cmd --permanent --get-zones | tr ' ' '\n' | grep -Fxq "$wireguard_zone" || firewall-cmd --permanent --new-zone="$wireguard_zone" >/dev/null
firewall-cmd --permanent --zone="$wireguard_zone" --set-target=DROP >/dev/null
IFS=',' read -r -a remote_subnets <<<"$remote_subnets_csv"
for remote_subnet in "${remote_subnets[@]}"; do
  [[ -n "$remote_subnet" ]] || continue
  ensure_policy vl-wg-lib "$wireguard_zone" libvirt "$remote_subnet" "$local_subnet"
  ensure_policy vl-lib-wg libvirt "$wireguard_zone" "$local_subnet" "$remote_subnet"
done

systemctl enable "wg-quick@${wireguard_interface}" >/dev/null
if systemctl is-active --quiet "wg-quick@${wireguard_interface}"; then
  systemctl restart "wg-quick@${wireguard_interface}"
else
  systemctl start "wg-quick@${wireguard_interface}"
fi
firewall-cmd --permanent --zone="$wireguard_zone" --query-interface="$wireguard_interface" >/dev/null 2>&1 || firewall-cmd --permanent --zone="$wireguard_zone" --add-interface="$wireguard_interface" >/dev/null
firewall-cmd --reload >/dev/null
current_zone="$(firewall-cmd --get-zone-of-interface "$wireguard_interface" 2>/dev/null || true)"
if [[ "$current_zone" != "$wireguard_zone" ]]; then
  firewall-cmd --zone="$wireguard_zone" --change-interface="$wireguard_interface" >/dev/null
fi
echo "Configured ${wireguard_interface} for ${local_subnet}; remote VM subnets: ${remote_subnets_csv:-none}"
