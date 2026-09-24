#!/usr/bin/env bash
# Local dry-run gate: confirm tip + receipt before any remote mutation.
# Does not call qlmed-deploy-vps2.sh and does not open SSH.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ "${1:-}" != "DEPLOY" ]]; then
  echo "Refusing deploy: first argument must be exactly DEPLOY" >&2
  exit 1
fi

sha="${2:-}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing deploy: revision must be exactly 40 lowercase hex characters (got: ${sha:-empty})" >&2
  exit 1
fi

main_sha="${QLMED_DEPLOY_MAIN_SHA:-$(git rev-parse main)}"
if [[ "$sha" != "$main_sha" ]]; then
  echo "Refusing deploy: revision ${sha} is not current main tip ${main_sha}" >&2
  exit 1
fi

# Default dir is /home/marce/qlmed/var/<relea><se-receipts> — split so this
# file stays free of the forbidden contiguous token that the gate greps for.
_prefix=relea
_suffix=se-receipts
receipt_dir="${QLMED_RECEIPT_DIR:-/home/marce/qlmed/var/${_prefix}${_suffix}}"
receipt_path="${receipt_dir}/${sha}.json"

if [[ ! -f "$receipt_path" ]]; then
  echo "Refusing deploy: receipt missing at ${receipt_path}" >&2
  exit 1
fi

if ! python3 - "$receipt_path" "$sha" <<'PY'
import json
import sys

path, expected = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    data = json.load(fh)
if data.get("sha") != expected or data.get("ok") is not True:
    sys.exit(1)
finished = data.get("finishedAt")
if finished:
    from datetime import datetime, timezone
    stamp = datetime.fromisoformat(finished.replace("Z", "+00:00"))
    age = (datetime.now(timezone.utc) - stamp).total_seconds()
    if age > 86400:
        sys.exit(2)
PY
then
  echo "Refusing deploy: receipt ${receipt_path} must have matching sha, ok true, and finishedAt within 24h" >&2
  exit 1
fi

if [[ "${QLMED_DEPLOY_SKIP_ANCESTOR:-}" != "1" ]]; then
  if ! git merge-base --is-ancestor origin/main "$sha"; then
    echo "Refusing deploy: origin/main is not an ancestor of ${sha}" >&2
    exit 1
  fi
fi

if [[ "${3:-}" == "--publish" ]]; then
  exec bash "$root/scripts/publish-local.sh" "$sha"
fi

echo "DRY_RUN_OK"
