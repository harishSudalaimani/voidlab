#!/usr/bin/env bash
set -euo pipefail

cilium_version="$1"
cilium_cli_version="$2"

if [[ ! "$cilium_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid Cilium version: ${cilium_version}" >&2
  exit 1
fi
if [[ ! "$cilium_cli_version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid Cilium CLI version: ${cilium_cli_version}" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64) cli_arch=amd64 ;;
  aarch64) cli_arch=arm64 ;;
  *) echo "Unsupported Cilium CLI architecture: $(uname -m)" >&2; exit 1 ;;
esac

installed_cli_version="$(cilium version --client 2>/dev/null | awk '/cilium-cli:/ {print $2; exit}' || true)"
if [[ "$installed_cli_version" != "$cilium_cli_version" ]]; then
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  archive="cilium-linux-${cli_arch}.tar.gz"
  release_url="https://github.com/cilium/cilium-cli/releases/download/${cilium_cli_version}"
  curl -fsSL --retry 3 "${release_url}/${archive}" -o "${temp_dir}/${archive}"
  curl -fsSL --retry 3 "${release_url}/${archive}.sha256sum" -o "${temp_dir}/${archive}.sha256sum"
  (cd "$temp_dir" && sha256sum --check "${archive}.sha256sum")
  tar -xzf "${temp_dir}/${archive}" -C "$temp_dir" cilium
  install -m 0755 "${temp_dir}/cilium" /usr/local/bin/cilium
  rm -rf "$temp_dir"
  trap - EXIT
fi

export KUBECONFIG=/etc/kubernetes/admin.conf
if [[ ! -s "$KUBECONFIG" ]]; then
  echo "Kubernetes admin kubeconfig is missing at ${KUBECONFIG}" >&2
  exit 1
fi

# Use kubeadm's per-node PodCIDRs, retain kube-proxy, and use VXLAN across the
# VoidLab VM network. A single operator replica keeps the small cluster light.
cilium install \
  --version "$cilium_version" \
  --set ipam.mode=kubernetes \
  --set kubeProxyReplacement=false \
  --set routingMode=tunnel \
  --set tunnelProtocol=vxlan \
  --set operator.replicas=1

cilium status --wait --wait-duration=15m
