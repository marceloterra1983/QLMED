#!/bin/bash
# qlmed-cert-upload.sh — sobe o certificado A1 (.pfx) direto pela API do QLMED,
# sem depender do navegador. Faz login NextAuth (email + PIN/senha) e POSTa em
# /api/certificate/upload. Senhas são pedidas interativamente (sem echo) e não
# ficam em history/logs.
#
# Uso: qlmed-cert-upload.sh /caminho/do/certificado.pfx
set -euo pipefail

BASE="${QLMED_URL:-https://app.qlmed.com.br}"
PFX="${1:-$HOME/certificado-qlmed-2026.pfx}"
[ -f "$PFX" ] || { echo "❌ arquivo não encontrado: $PFX"; echo "uso: $0 [/caminho/do/certificado.pfx]"; exit 1; }
echo "Certificado: $PFX"

SIZE=$(stat -c %s "$PFX")
if [ "$SIZE" -gt $((1024*1024)) ]; then
  echo "❌ arquivo tem ${SIZE} bytes — a API limita a 1MB. É o .pfx certo?"; exit 1
fi

read -rp  "Email (usuário admin do QLMED): " EMAIL
read -rsp "PIN ou senha: " PASS; echo
read -rsp "Senha do certificado (.pfx): " CERTPASS; echo

# Checagem local da senha do pfx antes de gastar tentativa na API
if command -v openssl >/dev/null; then
  if openssl pkcs12 -in "$PFX" -passin "pass:$CERTPASS" -noout -nokeys 2>/dev/null \
     || openssl pkcs12 -legacy -in "$PFX" -passin "pass:$CERTPASS" -noout -nokeys 2>/dev/null; then
    echo "✓ senha do .pfx confere (validação local)"
  else
    echo "⚠️  openssl não validou a senha do .pfx localmente (pode ser algoritmo não suportado) — seguindo mesmo assim"
  fi
fi

JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

CSRF=$(curl -s -m 20 -c "$JAR" "$BASE/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
[ -n "$CSRF" ] || { echo "❌ não consegui obter CSRF token de $BASE"; exit 1; }

curl -s -m 20 -b "$JAR" -c "$JAR" -o /dev/null -X POST "$BASE/api/auth/callback/credentials" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "json=true"

if ! grep -q "session-token" "$JAR"; then
  echo "❌ login falhou (email/PIN incorretos?). Cuidado: várias falhas seguidas bloqueiam a conta."
  exit 1
fi
echo "✓ login OK"

RESP=$(curl -s -m 60 -b "$JAR" -X POST "$BASE/api/certificate/upload" \
  -F "file=@$PFX;type=application/x-pkcs12" \
  -F "password=$CERTPASS")

echo "Resposta da API:"
echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"

if echo "$RESP" | grep -q '"success"'; then
  echo "✅ Certificado atualizado com sucesso."
else
  echo "❌ Upload não confirmado — ver resposta acima."
  exit 1
fi
