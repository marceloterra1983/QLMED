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

# 5. Advisory NOVO e não dispensado reprova. Esta é a propriedade que o portão
#    existe para ter, e era a única que não estava testada — a re-auditoria
#    furou o portão exactamente aqui.
cat > "$tmp/novo.json" <<'JSON'
{"vulnerabilities":{"mysql2":{"name":"mysql2","severity":"high",
  "via":[{"source":1153173,"name":"mysql2","severity":"high",
          "url":"https://github.com/advisories/GHSA-3f6p-5ww8-9rcr","title":"m"}]},"pacote-x":{"name":"pacote-x","severity":"critical",
  "via":[{"source":9,"name":"pacote-x","severity":"critical",
          "url":"https://github.com/advisories/GHSA-novo-novo-novo","title":"t"}]}}}
JSON
QLMED_AUDIT_REPORT_FILE="$tmp/novo.json" expect_status "advisory novo" "$gate" 1
expect_output "GHSA-novo-novo-novo"

# 6. Advisory CRITICAL pendurado num nó de severidade MENOR também reprova.
#    O `npm audit` agrega no nó, e a agregação pode esconder o aviso. Ler só a
#    severidade do nó deixava passar um critical — foi assim que o portão foi
#    furado.
cat > "$tmp/mascarado.json" <<'JSON'
{"vulnerabilities":{"mysql2":{"name":"mysql2","severity":"high",
  "via":[{"source":1153173,"name":"mysql2","severity":"high",
          "url":"https://github.com/advisories/GHSA-3f6p-5ww8-9rcr","title":"m"}]},"pacote-y":{"name":"pacote-y","severity":"moderate",
  "via":[{"source":10,"name":"pacote-y","severity":"critical",
          "url":"https://github.com/advisories/GHSA-mask-mask-mask","title":"t"}]}}}
JSON
QLMED_AUDIT_REPORT_FILE="$tmp/mascarado.json" expect_status "critical mascarado por nó moderate" "$gate" 1
expect_output "GHSA-mask-mask-mask"

# 7. Contraprova: um relatório só com severidade baixa passa. Sem este caso, os
#    dois acima ficariam satisfeitos por um portão que reprova tudo.
cat > "$tmp/baixo.json" <<'JSON'
{"vulnerabilities":{"mysql2":{"name":"mysql2","severity":"high",
  "via":[{"source":1153173,"name":"mysql2","severity":"high",
          "url":"https://github.com/advisories/GHSA-3f6p-5ww8-9rcr","title":"m"}]},"pacote-z":{"name":"pacote-z","severity":"low",
  "via":[{"source":11,"name":"pacote-z","severity":"low",
          "url":"https://github.com/advisories/GHSA-low0-low0-low0","title":"t"}]}}}
JSON
QLMED_AUDIT_REPORT_FILE="$tmp/baixo.json" expect_status "só severidade baixa" "$gate" 0
expect_output "Dependency audit OK"

echo "test-dependency-audit: OK (7 casos)"
