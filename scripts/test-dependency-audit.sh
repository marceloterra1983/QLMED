#!/usr/bin/env bash
# Controlo positivo do portão de dependências.
#
# O modo de falha que interessa não é "reprova demais", é "aprova tudo em
# silêncio": uma dispensa larga, vencida ou morta transforma o portão em
# decoração e ninguém percebe, porque o CI fica verde. Cada caso abaixo
# quebra o script de propósito e exige que ele reprove.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
gate="$root/scripts/verify-dependency-audit.mjs"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { echo "test-dependency-audit: $1" >&2; exit 1; }

expect_status() {
  local label="$1" script="$2" expected="$3"
  local status=0
  ( cd "$root" && node "$script" ) >"$tmp/out" 2>&1 || status=$?
  if [ "$status" != "$expected" ]; then
    echo "--- saída ---" >&2
    cat "$tmp/out" >&2
    fail "$label: esperava status $expected, veio $status"
  fi
}

expect_output() {
  grep -q "$1" "$tmp/out" || { cat "$tmp/out" >&2; fail "esperava a mensagem: $1"; }
}

# 1. Estado real do repositório: passa, e diz o que dispensou.
expect_status "estado atual" "$gate" 0
expect_output "Dependency audit OK"
expect_output "Dispensado até"

# 2. Sem dispensa nenhuma, o aviso conhecido reprova.
sed 's/^const WAIVERS = \[$/const WAIVERS = []; const _IGNORED = [/' "$gate" > "$tmp/sem-dispensa.mjs"
expect_status "sem dispensa" "$tmp/sem-dispensa.mjs" 1
expect_output "sem dispensa"

# 3. Dispensa vencida reprova em vez de continuar valendo.
sed "s/expires: '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]'/expires: '2020-01-01'/" "$gate" > "$tmp/vencida.mjs"
expect_status "dispensa vencida" "$tmp/vencida.mjs" 1
expect_output "Dispensa vencida"

# 4. Dispensa que não casa com nada reprova: lista morta é permissão esquecida.
sed "s/advisory: 'GHSA-[0-9a-zA-Z-]*'/advisory: 'GHSA-0000-0000-0000'/" "$gate" > "$tmp/morta.mjs"
expect_status "dispensa morta" "$tmp/morta.mjs" 1
expect_output "sem aviso correspondente"

echo "test-dependency-audit: OK (4 casos)"
