#!/usr/bin/env bash
# O despacho pelo GitHub Actions foi aposentado (ADR-0021).
# Este script existe para falhar fechado se alguém ainda chamar o atalho antigo.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-production.sh [REVISION]

Recusa. O Actions não publica mais.

  npm run verify:release <SHA>
  npm run deploy:local -- DEPLOY <SHA> --publish
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 1
fi

echo "Refusing: GitHub Actions deploy is retired. Verify with npm run verify:release, then npm run deploy:local -- DEPLOY <SHA> --publish" >&2
exit 1
