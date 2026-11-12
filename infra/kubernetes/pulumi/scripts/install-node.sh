#!/usr/bin/env bash
set -euo pipefail

kubernetes_minor="$1"
export DEBIAN_FRONTEND=noninteractive

# kubelet requires swap to be off. Persist this by commenting swap entries in fstab.
swapoff -a
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

apt-get update
apt-get install -y ca-certificates containerd curl gpg

install -d -m 0755 /etc/containerd
containerd config default > /etc/containerd/config.toml
sed -ri 's/^([[:space:]]*)SystemdCgroup = false/\1SystemdCgroup = true/' /etc/containerd/config.toml
sed -ri 's/^disabled_plugins = \["cri"\]/disabled_plugins = []/' /etc/containerd/config.toml
grep -q 'SystemdCgroup = true' /etc/containerd/config.toml
systemctl enable --now containerd
systemctl restart containerd

install -d -m 0755 /etc/apt/keyrings
curl -fsSL "https://pkgs.k8s.io/core:/stable:/${kubernetes_minor}/deb/Release.key" -o /tmp/kubernetes-apt-key.asc
gpg --dearmor --yes --output /etc/apt/keyrings/kubernetes-apt-keyring.gpg /tmp/kubernetes-apt-key.asc
chmod 0644 /etc/apt/keyrings/kubernetes-apt-keyring.gpg
rm -f /tmp/kubernetes-apt-key.asc
printf 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/%s/deb/ /\n' "$kubernetes_minor" >/etc/apt/sources.list.d/kubernetes.list

apt-get update
apt-get install -y kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
systemctl enable kubelet

echo "Installed and held Kubernetes packages from the ${kubernetes_minor} apt repository"
