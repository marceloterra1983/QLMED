#!/usr/bin/env bash
set -euo pipefail

workflow=".github/workflows/ci.yml"
package="package.json"

test -f "$workflow"
test -f "$package"
! grep -Eq 'self-hosted|qlmed-prod' "$workflow"
grep -q 'ubuntu-24\.04' "$workflow"
! grep -q 'postgres:16' "$workflow"
grep -q '"typecheck": "tsc --noEmit"' "$package"
grep -q 'run: npm run typecheck' "$workflow"

echo "CI hardening policy OK"
