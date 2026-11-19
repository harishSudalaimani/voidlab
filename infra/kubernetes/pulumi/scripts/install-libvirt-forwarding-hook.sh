#!/usr/bin/env bash
set -euo pipefail

local_subnet="$1"
peer_subnet="$2"
network_name="$3"
wireguard_interface="$4"

if [[ ! "$local_subnet" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$ || ! "$peer_subnet" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$ ]]; then
  echo "Expected IPv4 CIDR subnets" >&2
  exit 1
fi

helper_dir=/usr/local/libexec/voidlab
helper="$helper_dir/libvirt-network-firewall"
hook_dir=/etc/libvirt/hooks
hook="$hook_dir/network"
backup="$hook_dir/network.voidlab-original"
hook_marker="# voidlab-managed-network-hook"

install -d -m 0755 "$helper_dir" "$hook_dir"

printf -v local_subnet_q '%q' "$local_subnet"
printf -v peer_subnet_q '%q' "$peer_subnet"
printf -v network_name_q '%q' "$network_name"
printf -v wireguard_interface_q '%q' "$wireguard_interface"
cat >"$helper" <<EOF
#!/usr/bin/env bash
set -euo pipefail

local_subnet=${local_subnet_q}
peer_subnet=${peer_subnet_q}
network_name=${network_name_q}
wireguard_interface=${wireguard_interface_q}

network_info="\$(virsh -c qemu:///system net-info "\$network_name")" || {
  echo "Libvirt network \$network_name is not defined" >&2
  exit 1
}
if ! grep -Eq '^Active:[[:space:]]+yes$' <<<"\$network_info"; then
  virsh -c qemu:///system net-start "\$network_name"
fi
virsh -c qemu:///system net-autostart "\$network_name" >/dev/null

nft list chain ip libvirt_network guest_input >/dev/null
nft list chain ip libvirt_network guest_nat >/dev/null

input_comment="voidlab routed ingress \$local_subnet from \$peer_subnet"
nat_comment="voidlab routed no-nat \$local_subnet to \$peer_subnet"
if ! nft list chain ip libvirt_network guest_input | grep -Fq -- "\$input_comment"; then
  nft insert rule ip libvirt_network guest_input iifname "\$wireguard_interface" ip saddr "\$peer_subnet" ip daddr "\$local_subnet" accept comment "\"\$input_comment\""
fi
if ! nft list chain ip libvirt_network guest_nat | grep -Fq -- "\$nat_comment"; then
  nft insert rule ip libvirt_network guest_nat ip saddr "\$local_subnet" ip daddr "\$peer_subnet" return comment "\"\$nat_comment\""
fi

echo "Installed libvirt nftables forwarding and NAT exceptions for \$local_subnet <-> \$peer_subnet"
EOF
chmod 0755 "$helper"

if [[ -L "$hook" ]]; then
  echo "$hook is a symlink; refusing to replace it" >&2
  exit 1
fi
if [[ -e "$hook" ]] && ! grep -Fq "$hook_marker" "$hook"; then
  if [[ -e "$backup" ]]; then
    echo "Both $hook and $backup exist without the VoidLab hook marker; refusing to overwrite either" >&2
    exit 1
  fi
  cp -a "$hook" "$backup"
fi

cat >"$hook" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
# voidlab-managed-network-hook

backup=/etc/libvirt/hooks/network.voidlab-original
if [[ -x "$backup" ]]; then
  "$backup" "$@"
fi

case "${3:-}" in
  started|updated)
    /usr/local/libexec/voidlab/libvirt-network-firewall
    ;;
esac
EOF
chmod 0755 "$hook"

# Libvirt reads hooks at daemon startup. Apply now for the already running network;
# the hook reapplies the narrowly scoped rules after subsequent network starts.
"$helper"
