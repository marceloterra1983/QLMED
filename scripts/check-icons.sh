#!/usr/bin/env bash
# Validates all Material Symbols icons used in code are in the font subset.
# Run: bash scripts/check-icons.sh
set -euo pipefail

LAYOUT="src/app/layout.tsx"

SUBSET=$(grep -oP "'[a-z_]+'" "$LAYOUT" | tr -d "'" | sort -u)

USED=$(
  grep -rohP '>[a-z][a-z_]+</span' src/app/ src/components/ 2>/dev/null | sed 's/^>//;s/<\/span$//'
  grep -rohP "icon:\s*['\"][a-z_]+['\"]" src/app/ src/components/ 2>/dev/null | grep -oP "['\"][a-z_]+['\"]" | tr -d "'\""
  grep -rohP 'icon="[a-z_]+"' src/app/ src/components/ 2>/dev/null | grep -oP '"[a-z_]+"' | tr -d '"'
  grep -rohP "icon=\{['\"][a-z_]+['\"]" src/app/ src/components/ 2>/dev/null | grep -oP "['\"][a-z_]+['\"]" | tr -d "'\""
) || true

MISSING=$(comm -23 <(echo "$USED" | grep -E '^[a-z_]{2,}$' | sort -u) <(echo "$SUBSET")) || true

if [ -z "$MISSING" ]; then
  echo "All $(echo "$USED" | grep -E '^[a-z_]{2,}$' | sort -u | wc -l) icons are in the font subset."
  echo "Subset has $(echo "$SUBSET" | wc -l) icons across $(grep -c 'MATERIAL_ICONS_' "$LAYOUT") chunks."
  exit 0
else
  echo "Icons used but NOT in MATERIAL_ICONS subset (src/app/layout.tsx):"
  echo "$MISSING"
  echo ""
  echo "Add them to MATERIAL_ICONS_A or MATERIAL_ICONS_B in $LAYOUT"
  exit 1
fi
