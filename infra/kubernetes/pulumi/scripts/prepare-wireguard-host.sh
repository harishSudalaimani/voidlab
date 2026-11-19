#!/usr/bin/env bash
set -euo pipefail

if ! command -v dnf >/dev/null 2>&1; then
  echo "WireGuard host setup currently expects Fedora with dnf" >&2
  exit 1
fi

dnf install -y wireguard-tools >&2
if ! firewall-cmd --state >/dev/null 2>&1; then
  echo "firewalld must already be active; start it manually after confirming SSH remains allowed" >&2
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
