#!/usr/bin/env bash
set -euo pipefail

control_plane_ip="$1"
sed "s#server: https://${control_plane_ip}:6443#server: https://127.0.0.1:16443#" /etc/kubernetes/admin.conf | base64 -w0
printf '\n'
