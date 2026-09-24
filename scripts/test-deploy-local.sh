#!/usr/bin/env bash
# Controlo positivo do dry-run local (recibo + tip). Sem rede, docker ou ssh.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$root/scripts/deploy-local.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

sha40="$(printf 'a%.0s' {1..40})"
other40="$(printf 'b%.0s' {1..40})"

expect_refuse() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "FALHOU: $label deveria RECUSAR e aprovou" >&2
    exit 1
  fi
  echo "ok"
}

expect_ok() {
  local label="$1"
  shift
  local out
  out="$("$@")"
  if [[ "$out" != "DRY_RUN_OK" ]]; then
    echo "FALHOU: $label esperava DRY_RUN_OK, obteve: ${out}" >&2
    exit 1
  fi
  echo "ok"
}

# sem DEPLOY
expect_refuse "sem DEPLOY" \
  env QLMED_RECEIPT_DIR="$tmpdir" QLMED_DEPLOY_MAIN_SHA="$sha40" QLMED_DEPLOY_SKIP_ANCESTOR=1 \
  "$script" NOTDEPLOY "$sha40"

# SHA curto
expect_refuse "SHA curto" \
  env QLMED_RECEIPT_DIR="$tmpdir" QLMED_DEPLOY_MAIN_SHA="$sha40" QLMED_DEPLOY_SKIP_ANCESTOR=1 \
  "$script" DEPLOY deadbeef

# SHA que não é o tip
expect_refuse "SHA que nao e tip" \
  env QLMED_RECEIPT_DIR="$tmpdir" QLMED_DEPLOY_MAIN_SHA="$sha40" QLMED_DEPLOY_SKIP_ANCESTOR=1 \
  "$script" DEPLOY "$other40"

# sem recibo
expect_refuse "sem recibo" \
  env QLMED_RECEIPT_DIR="$tmpdir" QLMED_DEPLOY_MAIN_SHA="$sha40" QLMED_DEPLOY_SKIP_ANCESTOR=1 \
  "$script" DEPLOY "$sha40"

# recibo com ok false
printf '{"sha":"%s","ok":false}\n' "$sha40" > "${tmpdir}/${sha40}.json"
expect_refuse "recibo ok false" \
  env QLMED_RECEIPT_DIR="$tmpdir" QLMED_DEPLOY_MAIN_SHA="$sha40" QLMED_DEPLOY_SKIP_ANCESTOR=1 \
  "$script" DEPLOY "$sha40"

# recibo ok e ancestor saltado
printf '{"sha":"%s","ok":true}\n' "$sha40" > "${tmpdir}/${sha40}.json"
expect_ok "recibo ok dry-run" \
  env QLMED_RECEIPT_DIR="$tmpdir" QLMED_DEPLOY_MAIN_SHA="$sha40" QLMED_DEPLOY_SKIP_ANCESTOR=1 \
  "$script" DEPLOY "$sha40"

echo "ok"
