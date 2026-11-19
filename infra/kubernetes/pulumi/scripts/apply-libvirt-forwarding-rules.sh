#!/usr/bin/env bash
set -euo pipefail

local_subnet="$1"
peer_subnet="$2"
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

input_comment="voidlab routed ingress ${local_subnet} from ${peer_subnet}"
nat_comment="voidlab routed no-nat ${local_subnet} to ${peer_subnet}"
if ! nft list chain ip libvirt_network guest_input | grep -Fq -- "$input_comment"; then
  nft insert rule ip libvirt_network guest_input iifname "$wireguard_interface" ip saddr "$peer_subnet" ip daddr "$local_subnet" accept comment "\"$input_comment\""
fi
if ! nft list chain ip libvirt_network guest_nat | grep -Fq -- "$nat_comment"; then
  nft insert rule ip libvirt_network guest_nat ip saddr "$local_subnet" ip daddr "$peer_subnet" return comment "\"$nat_comment\""
fi

if ! nft list chain ip libvirt_network guest_input | grep -Fq -- "$input_comment"; then
  echo "libvirt guest_input allow rule was not installed for ${peer_subnet} -> ${local_subnet}" >&2
  exit 1
fi
if ! nft list chain ip libvirt_network guest_nat | grep -Fq -- "$nat_comment"; then
  echo "libvirt guest_nat bypass rule was not installed for ${local_subnet} -> ${peer_subnet}" >&2
  exit 1
fi

echo "Verified libvirt forwarding rules for ${local_subnet} <-> ${peer_subnet}"
