#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "$root/scripts/check-ai-tooling.mjs" --root "$root" >/dev/null

tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

mkdir -p "$tmp/.cursor/rules" "$tmp/.cursor/skills" "$tmp/.agents/skills" "$tmp/.specify" "$tmp/.cursor/hooks"
cp -a "$root/.cursor/rules/." "$tmp/.cursor/rules/"
cp -a "$root/.cursor/skills/." "$tmp/.cursor/skills/"
cp -a "$root/.cursor/hooks/." "$tmp/.cursor/hooks/"
cp -a "$root/.agents/skills/." "$tmp/.agents/skills/"
cp "$root/.cursor/hooks.json" "$tmp/.cursor/hooks.json"
cp "$root/governance.yaml" "$tmp/governance.yaml"
cp "$root/.specify/init-options.json" "$tmp/.specify/init-options.json"
cp "$root/.specify/integration.json" "$tmp/.specify/integration.json"
cp "$root/AGENTS.md" "$tmp/AGENTS.md"
cp "$root/CLAUDE.md" "$tmp/CLAUDE.md"
rm -f "$tmp/.cursor/rules/graphify.mdc"

if node "$root/scripts/check-ai-tooling.mjs" --root "$tmp" >/dev/null 2>&1; then
  echo "invalid AI tooling fixture unexpectedly passed" >&2
  exit 1
fi

echo "AI tooling checker fixtures passed."
