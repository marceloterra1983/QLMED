#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "$root/scripts/validate-docs.mjs" --root "$root/scripts/docs-fixtures/valid" --quiet

if node "$root/scripts/validate-docs.mjs" --root "$root/scripts/docs-fixtures/invalid" --quiet >/dev/null 2>&1; then
  echo "invalid documentation fixture unexpectedly passed" >&2
  exit 1
fi

echo "Documentation validator fixtures passed."

