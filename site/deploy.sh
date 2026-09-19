#!/usr/bin/env bash
# Deploy newsdesk-bd to Vercel (cloud build — local npm build is impossible on Termux).
# Usage:
#   VERCEL_TOKEN=vcp_... ./deploy.sh      # one-off token
# The active token is kept in the global agent memory (rotate frequently).
set -euo pipefail

if ! command -v vercel >/dev/null 2>&1; then
  echo "ERROR: vercel CLI not found" >&2
  exit 1
fi

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "ERROR: set VERCEL_TOKEN (see global memory for the active token)" >&2
  exit 1
fi

cd "$(dirname "$0")"
echo "== Building + deploying $(basename "$(pwd)") to Vercel =="
vercel deploy --prod --yes --token "$VERCEL_TOKEN"