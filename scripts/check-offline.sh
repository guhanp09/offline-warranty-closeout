#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:*"))' \
  node scripts/check-offline.mjs
