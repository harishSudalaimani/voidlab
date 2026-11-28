#!/usr/bin/env bash
set -euo pipefail

exec 1>&2

control_plane_ip="$1"
pod_cidr="$2"
allow_single_cpu="$3"

if [[ ! -s /etc/kubernetes/admin.conf ]]; then
  kubernetes_version="$(kubeadm version -o short)"
  if [[ "$kubernetes_version" != v1.37.* ]]; then
    echo "Expected kubeadm v1.37.x, found ${kubernetes_version}" >&2
    exit 1
  fi

  init_args=(
    --kubernetes-version "$kubernetes_version"
    --apiserver-advertise-address "$control_plane_ip"
    --apiserver-cert-extra-sans "$control_plane_ip,127.0.0.1,localhost"
    --pod-network-cidr "$pod_cidr"
    --skip-phases=addon/kube-proxy
  )
  if [[ "$allow_single_cpu" == "true" ]]; then
    init_args+=(--ignore-preflight-errors=NumCPU)
  fi
  kubeadm init "${init_args[@]}"
fi
