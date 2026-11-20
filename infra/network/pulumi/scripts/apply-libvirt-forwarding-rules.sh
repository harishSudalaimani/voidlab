#!/usr/bin/env bash
set -euo pipefail

local_subnet="$1"
remote_subnets_csv="$2"
network_name="$3"
wireguard_interface="$4"

network_info="$(virsh -c qemu:///system net-info "$network_name")" || {
  echo "Libvirt network ${network_name} is not defined" >&2
  exit 1
}
if ! grep -Eq '^Active:[[:space:]]+yes$' <<<"$network_info"; then
  virsh -c qemu:///system net-start "$network_name"
fi
virsh -c qemu:///system net-autostart "$network_name" >/dev/null
nft list chain ip libvirt_network guest_input >/dev/null
nft list chain ip libvirt_network guest_nat >/dev/null

IFS=',' read -r -a remote_subnets <<<"$remote_subnets_csv"
for remote_subnet in "${remote_subnets[@]}"; do
  [[ -n "$remote_subnet" ]] || continue
  input_comment="voidlab routed ingress ${local_subnet} from ${remote_subnet}"
  nat_comment="voidlab routed no-nat ${local_subnet} to ${remote_subnet}"
  input_rules="$(nft list chain ip libvirt_network guest_input)"
  if ! grep -Fq -- "$input_comment" <<<"$input_rules"; then
    nft insert rule ip libvirt_network guest_input iifname "$wireguard_interface" ip saddr "$remote_subnet" ip daddr "$local_subnet" accept comment "\"$input_comment\""
  fi
  nat_rules="$(nft list chain ip libvirt_network guest_nat)"
  if ! grep -Fq -- "$nat_comment" <<<"$nat_rules"; then
    nft insert rule ip libvirt_network guest_nat ip saddr "$local_subnet" ip daddr "$remote_subnet" return comment "\"$nat_comment\""
  fi
  input_rules="$(nft list chain ip libvirt_network guest_input)"
  grep -Fq -- "$input_comment" <<<"$input_rules" || {
    echo "libvirt guest_input rule is missing for ${remote_subnet} -> ${local_subnet}" >&2
    exit 1
  }
  nat_rules="$(nft list chain ip libvirt_network guest_nat)"
  grep -Fq -- "$nat_comment" <<<"$nat_rules" || {
    echo "libvirt guest_nat rule is missing for ${local_subnet} -> ${remote_subnet}" >&2
    exit 1
  }
done
echo "Verified libvirt forwarding from ${remote_subnets_csv:-no remote subnets} to ${local_subnet}"
