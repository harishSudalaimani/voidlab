#!/usr/bin/env bash
set -euo pipefail

if command -v dnf >/dev/null 2>&1; then
  dnf install -y wireguard-tools firewalld >&2
elif command -v apt-get >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get update >&2
  DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard-tools firewalld >&2
else
  echo "Install wireguard-tools and firewalld with the host's package manager first" >&2
  exit 1
fi
if ! firewall-cmd --state >/dev/null 2>&1; then
  echo "firewalld must be active on the hypervisor; start it after confirming SSH remains allowed" >&2
  exit 1
fi
install -d -m 0700 /etc/wireguard

private_key=/etc/wireguard/voidlab-privatekey
public_key=/etc/wireguard/voidlab-publickey
if [[ ! -s "$private_key" ]]; then
  temp_key="$(mktemp /etc/wireguard/voidlab-privatekey.XXXXXX)"
  trap 'rm -f "$temp_key"' EXIT
  umask 077
  wg genkey >"$temp_key"
  install -m 0600 "$temp_key" "$private_key"
  rm -f "$temp_key"
  trap - EXIT
fi
wg pubkey <"$private_key" >"$public_key"
chmod 0600 "$private_key"
chmod 0644 "$public_key"
cat "$public_key"
