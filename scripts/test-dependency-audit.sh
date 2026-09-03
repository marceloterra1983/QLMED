#!/usr/bin/env bash
# Controlo positivo do portão de dependências.
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

# Script com uma dispensa conhecida (só para casos 3–5).
cat > "$tmp/com-dispensa.mjs" <<'JS'
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const src = readFileSync(process.argv[1].replace(/com-dispensa\.mjs$/, '') + 'verify-dependency-audit.mjs', 'utf8');
JS
# Mais simples: copiar o gate e injetar WAIVERS no arquivo.
cp "$gate" "$tmp/gate-base.mjs"
python3 - "$tmp/gate-base.mjs" "$tmp/com-dispensa.mjs" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_text()
waiver = """const WAIVERS = [
  {
    advisory: 'GHSA-3f6p-5ww8-9rcr',
    package: 'mysql2',
    expires: '2099-01-01',
    reason: 'dispensa de teste',
  },
];
"""
import re
src2 = re.sub(r'const WAIVERS = \[\];', waiver, src, count=1)
if src2 == src:
    raise SystemExit('failed to inject WAIVERS')
Path(sys.argv[2]).write_text(src2)
PY

python3 - "$tmp/com-dispensa.mjs" "$tmp/vencida.mjs" <<'PY'
from pathlib import Path
import sys
t = Path(sys.argv[1]).read_text().replace("expires: '2099-01-01'", "expires: '2020-01-01'")
Path(sys.argv[2]).write_text(t)
PY

python3 - "$tmp/com-dispensa.mjs" "$tmp/morta.mjs" <<'PY'
from pathlib import Path
import sys
t = Path(sys.argv[1]).read_text().replace("advisory: 'GHSA-3f6p-5ww8-9rcr'", "advisory: 'GHSA-0000-0000-0000'")
Path(sys.argv[2]).write_text(t)
PY

# 1. Estado real do repositório: limpo (sem high/critical sem dispensa).
expect_status "estado atual" "$gate" 0
expect_output "Dependency audit OK"

# 2. Aviso high sem dispensa reprova (relatório injetado).
cat > "$tmp/sem.json" <<'JSON'
{"vulnerabilities":{"mysql2":{"name":"mysql2","severity":"high",
  "via":[{"source":1153173,"name":"mysql2","severity":"high",
          "url":"https://github.com/advisories/GHSA-3f6p-5ww8-9rcr","title":"m"}]}}}
JSON
QLMED_AUDIT_REPORT_FILE="$tmp/sem.json" expect_status "sem dispensa" "$gate" 1
expect_output "sem dispensa"

# 3. Dispensa válida cobre o aviso.
QLMED_AUDIT_REPORT_FILE="$tmp/sem.json" expect_status "com dispensa" "$tmp/com-dispensa.mjs" 0
expect_output "Dispensado até"
expect_output "Dependency audit OK"

# 4. Dispensa vencida reprova.
QLMED_AUDIT_REPORT_FILE="$tmp/sem.json" expect_status "dispensa vencida" "$tmp/vencida.mjs" 1
expect_output "Dispensa vencida"

# 5. Dispensa que não casa reprova.
QLMED_AUDIT_REPORT_FILE="$tmp/sem.json" expect_status "dispensa morta" "$tmp/morta.mjs" 1
expect_output "sem aviso correspondente"

# 6. Advisory novo não dispensado.
cat > "$tmp/novo.json" <<'JSON'
{"vulnerabilities":{"mysql2":{"name":"mysql2","severity":"high",
  "via":[{"source":1153173,"name":"mysql2","severity":"high",
          "url":"https://github.com/advisories/GHSA-3f6p-5ww8-9rcr","title":"m"}]},"pacote-x":{"name":"pacote-x","severity":"critical",
  "via":[{"source":9,"name":"pacote-x","severity":"critical",
          "url":"https://github.com/advisories/GHSA-novo-novo-novo","title":"t"}]}}}
JSON
QLMED_AUDIT_REPORT_FILE="$tmp/novo.json" expect_status "advisory novo" "$tmp/com-dispensa.mjs" 1
expect_output "GHSA-novo-novo-novo"

# 7. Critical mascarado por nó moderate.
cat > "$tmp/mascarado.json" <<'JSON'
{"vulnerabilities":{"mysql2":{"name":"mysql2","severity":"high",
  "via":[{"source":1153173,"name":"mysql2","severity":"high",
          "url":"https://github.com/advisories/GHSA-3f6p-5ww8-9rcr","title":"m"}]},"pacote-y":{"name":"pacote-y","severity":"moderate",
  "via":[{"source":10,"name":"pacote-y","severity":"critical",
          "url":"https://github.com/advisories/GHSA-mask-mask-mask","title":"t"}]}}}
JSON
QLMED_AUDIT_REPORT_FILE="$tmp/mascarado.json" expect_status "critical mascarado por nó moderate" "$tmp/com-dispensa.mjs" 1
expect_output "GHSA-mask-mask-mask"

# 8. Só severidade baixa passa (com dispensa cobrindo o high conhecido).
cat > "$tmp/baixo.json" <<'JSON'
{"vulnerabilities":{"mysql2":{"name":"mysql2","severity":"high",
  "via":[{"source":1153173,"name":"mysql2","severity":"high",
          "url":"https://github.com/advisories/GHSA-3f6p-5ww8-9rcr","title":"m"}]},"pacote-z":{"name":"pacote-z","severity":"low",
  "via":[{"source":11,"name":"pacote-z","severity":"low",
          "url":"https://github.com/advisories/GHSA-low0-low0-low0","title":"t"}]}}}
JSON
QLMED_AUDIT_REPORT_FILE="$tmp/baixo.json" expect_status "só severidade baixa" "$tmp/com-dispensa.mjs" 0
expect_output "Dependency audit OK"

echo "test-dependency-audit: OK (8 casos)"
