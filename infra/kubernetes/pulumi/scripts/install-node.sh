#!/usr/bin/env bash
set -euo pipefail

kubernetes_minor="$1"
containerd_root="$2"
. /etc/os-release
if [[ "${ID:-}" != "fedora" || "${VERSION_ID:-}" != "45" ]]; then
  echo "Expected Fedora 45; found ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

# Disable swap now and prevent Fedora's zram generator from recreating it on
# reboot. kubelet must not start with swap enabled for this cluster config.
swapoff -a
install -d -m 0755 /etc/systemd
cat >/etc/systemd/zram-generator.conf <<'EOF'
[zram0]
zram-size = 0
EOF
if [[ -f /etc/fstab ]]; then
  sed -ri '/^[^#].*[[:space:]]swap[[:space:]]/s/^/# voidlab disabled swap: /' /etc/fstab
fi
systemctl daemon-reload

cat >/etc/modules-load.d/kubernetes.conf <<'EOF'
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter

cat >/etc/sysctl.d/99-kubernetes-cri.conf <<'EOF'
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
EOF
sysctl --system

dnf install -y ca-certificates containerd curl iptables-nft conntrack-tools socat ethtool iscsi-initiator-utils nfs-utils
modprobe iscsi_tcp
systemctl enable --now iscsid
install -d -m 0755 "$containerd_root"
install -d -m 0755 /etc/containerd
containerd config default >/etc/containerd/config.toml
sed -ri "s|^root = .*|root = \"${containerd_root}\"|" /etc/containerd/config.toml
sed -ri 's/^([[:space:]]*)SystemdCgroup = false/\1SystemdCgroup = true/' /etc/containerd/config.toml
if ! grep -q 'SystemdCgroup = true' /etc/containerd/config.toml; then
  if grep -Eq '^\[plugins.*io.containerd.cri.v1.runtime.*runtimes.runc.options\]' /etc/containerd/config.toml; then
    sed -ri '/^\[plugins.*io.containerd.cri.v1.runtime.*runtimes.runc.options\]/a\  SystemdCgroup = true' /etc/containerd/config.toml
  else
    cat >>/etc/containerd/config.toml <<'EOF'

[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.runc.options]
  SystemdCgroup = true
EOF
  fi
fi
if grep -Eq '^disabled_plugins = .*"cri"' /etc/containerd/config.toml; then
  sed -ri 's/^disabled_plugins = .*$/disabled_plugins = []/' /etc/containerd/config.toml
fi
grep -q 'SystemdCgroup = true' /etc/containerd/config.toml
systemctl enable --now containerd
systemctl restart containerd

repo_version="v${kubernetes_minor}"
cat >/etc/yum.repos.d/kubernetes.repo <<EOF
[kubernetes]
name=Kubernetes
baseurl=https://pkgs.k8s.io/core:/stable:/${repo_version}/rpm/
enabled=1
gpgcheck=1
gpgkey=https://pkgs.k8s.io/core:/stable:/${repo_version}/rpm/repodata/repomd.xml.key
exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni
EOF

# Fedora 45 uses DNF5's disable_excludes option.
dnf install -y kubelet kubeadm kubectl --setopt=disable_excludes=kubernetes
systemctl enable kubelet

echo "Installed containerd and held Kubernetes ${repo_version} packages on Fedora 45"
