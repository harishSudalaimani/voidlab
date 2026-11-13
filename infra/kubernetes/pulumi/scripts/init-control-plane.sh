#!/usr/bin/env bash
set -euo pipefail

exec 3>&1
exec 1>&2

control_plane_ip="$1"
pod_cidr="$2"
allow_single_cpu="$3"
join_token_generation="$4"
# This value is a deliberate Pulumi input so an operator can request a fresh
# short-lived join token after a failed or delayed worker join.
: "$join_token_generation"

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

install -d -m 0700 -o void -g void /home/void/.kube
install -m 0600 -o void -g void /etc/kubernetes/admin.conf /home/void/.kube/config

join_command="$(kubeadm token create --print-join-command)"
if [[ "$join_command" != kubeadm\ join\ * ]]; then
  echo "kubeadm did not return a join command" >&2
  exit 1
fi
printf '%s\n' "$join_command" >&3
