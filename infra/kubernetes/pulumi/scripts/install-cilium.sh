#!/usr/bin/env bash
set -euo pipefail

cilium_version="$1"
cilium_cli_version="$2"
api_server_ip="$3"

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

# Do not switch an already-running kube-proxy cluster in one step. Cilium's
# supported migration is node-by-node and is documented in README.md.
if kubectl get daemonset cilium -n kube-system >/dev/null 2>&1; then
  replacement="$(kubectl get configmap cilium-config -n kube-system -o jsonpath='{.data.kube-proxy-replacement}')"
  if [[ "$replacement" != "true" ]] || kubectl get daemonset kube-proxy -n kube-system >/dev/null 2>&1; then
    echo "Existing cluster still has kube-proxy or Cilium replacement is disabled; complete the staged migration before applying this bootstrap update" >&2
    exit 1
  fi
  cilium status --wait --wait-duration=15m
  exit 0
fi

# Use kubeadm's per-node PodCIDRs and VXLAN across the VoidLab VM network.
# Explicit API server addressing lets Cilium route services without kube-proxy.
# One operator replica keeps the small cluster light.
cilium install \
  --version "$cilium_version" \
  --set ipam.mode=kubernetes \
  --set kubeProxyReplacement=true \
  --set "k8sServiceHost=${api_server_ip}" \
  --set k8sServicePort=6443 \
  --set routingMode=tunnel \
  --set tunnelProtocol=vxlan \
  --set operator.replicas=1

cilium status --wait --wait-duration=15m
