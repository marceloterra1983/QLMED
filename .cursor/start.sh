#!/usr/bin/env bash
# Cloud Agent — per-boot runtime init for QLMED.
#
# Runs on every environment start. Only (re)starts the PostgreSQL daemon and
# waits until it accepts connections. Dependency install, Prisma generate and
# migrations live in install.sh (one-time / snapshot), never here.
set -euo pipefail

echo "==> Ensuring PostgreSQL is online"
if command -v pg_lsclusters >/dev/null 2>&1; then
  if ! sudo pg_lsclusters 2>/dev/null | awk 'NR>1 {print $4}' | grep -q online; then
    sudo pg_ctlcluster 16 main start || true
  fi
  for _ in $(seq 1 30); do
    if sudo -u postgres pg_isready -q 2>/dev/null; then
      echo "==> PostgreSQL is ready"
      exit 0
    fi
    sleep 1
  done
  echo "PostgreSQL did not become ready in time" >&2
  exit 1
else
  echo "PostgreSQL not installed yet (install.sh has not run)" >&2
  exit 1
fi
