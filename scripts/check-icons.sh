#!/usr/bin/env bash
# Lists all Material Symbols icons used in code.
# Since we self-host the full font, all icons are available.
# Run: bash scripts/check-icons.sh
set -euo pipefail

USED=$(
  grep -rohP '>[a-z][a-z_0-9]+</span' src/app/ src/components/ 2>/dev/null | sed 's/^>//;s/<\/span$//'
  grep -rohP "icon:\s*['\"][a-z_0-9]+['\"]" src/app/ src/components/ 2>/dev/null | grep -oP "['\"][a-z_0-9]+['\"]" | tr -d "'\""
  grep -rohP 'icon="[a-z_0-9]+"' src/app/ src/components/ 2>/dev/null | grep -oP '"[a-z_0-9]+"' | tr -d '"'
  grep -rohP "icon=\{['\"][a-z_0-9]+['\"]" src/app/ src/components/ 2>/dev/null | grep -oP "['\"][a-z_0-9]+['\"]" | tr -d "'\""
) || true

UNIQUE=$(echo "$USED" | grep -E '^[a-z_]{2,}[a-z0-9_]*$' | sort -u)
COUNT=$(echo "$UNIQUE" | wc -l)

echo "Material Symbols icons used in codebase: $COUNT"
echo "Font: public/fonts/material-symbols.woff2 (full, all icons available)"
echo ""
echo "$UNIQUE"
