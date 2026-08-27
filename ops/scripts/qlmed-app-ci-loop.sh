#!/usr/bin/env bash
# qlmed-app-ci-loop.sh — loop autônomo de melhoria contínua do app QLMED
#
# Ciclo: medir → classificar → propor (issue + PR seguro) → humano aprova → CI/deploy.
# Nunca mergeia. Nunca sobe major de next/prisma/react sozinho.
#
# Uso:
#   qlmed-app-ci-loop.sh --mode audit|propose [--json]
set -euo pipefail

MODE="audit"
AS_JSON=1
REPO_DIR="${QLMED_APP_DEV:-$HOME/qlmed}"
REPO_SLUG="${QLMED_GITHUB_REPO:-marceloterra1983/QLMED}"
BASE_BRANCH="${QLMED_CI_LOOP_BASE_BRANCH:-main}"
POLICY="${QLMED_CI_LOOP_POLICY:-$REPO_DIR/.ci-loop/policy.json}"
STATE_DIR="${QLMED_CI_LOOP_STATE:-$HOME/.local/state/qlmed-ci-loop}"
WORKTREE_ROOT="${QLMED_CI_LOOP_WORKTREE:-$HOME/.cache/qlmed-ci-loop}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:?}"; shift 2 ;;
    --mode=*) MODE="${1#*=}"; shift ;;
    --json) AS_JSON=1; shift ;;
    --no-json) AS_JSON=0; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "uso inválido: $1" >&2; exit 2 ;;
  esac
done

[[ "$MODE" == "audit" || "$MODE" == "propose" ]] || { echo "mode inválido" >&2; exit 2; }
[[ -f "$POLICY" ]] || { echo "policy ausente: $POLICY" >&2; exit 1; }
[[ -d "$REPO_DIR" ]] || { echo "QLMED app dir ausente: $REPO_DIR" >&2; exit 1; }

mkdir -p "$STATE_DIR" "$WORKTREE_ROOT"
export PATH="$HOME/.local/bin:$PATH"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
  nvm use 22 >/dev/null 2>&1 || true
fi

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DAY="$(date -u +%Y-%m-%d)"
REPORT_JSON="$STATE_DIR/report-$DAY.json"
SCORECARD_MD="$STATE_DIR/SCORECARD-$DAY.md"

cd "$REPO_DIR"

NODE_VER="$(node -e 'console.log(process.version.replace(/^v/,""))')"
PKG_JSON="$(node -e 'const p=require("./package.json"); console.log(JSON.stringify({
  next:p.dependencies.next, react:p.dependencies.react,
  prisma:p.dependencies.prisma, zod:p.dependencies.zod,
  nextAuth:p.dependencies["next-auth"], typescript:p.devDependencies.typescript,
  vitest:p.devDependencies.vitest
}))')"

npm outdated --json >"$STATE_DIR/outdated.json" 2>/dev/null || true
[[ -s "$STATE_DIR/outdated.json" ]] || echo '{}' >"$STATE_DIR/outdated.json"
npm audit --omit=dev --json >"$STATE_DIR/audit.json" 2>/dev/null || true
[[ -s "$STATE_DIR/audit.json" ]] || echo '{"metadata":{"vulnerabilities":{}}}' >"$STATE_DIR/audit.json"

SPECKIT_PROJECT="$(node -e 'try{console.log(require("./.specify/init-options.json").speckit_version||"")}catch{console.log("")}')"
SPECKIT_CLI="$(specify --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
N8N_IMG="$(docker inspect qlmed-n8n --format '{{.Config.Image}}' 2>/dev/null || true)"

python3 - "$POLICY" "$STATE_DIR/outdated.json" "$STATE_DIR/audit.json" "$PKG_JSON" \
  "$NODE_VER" "$SPECKIT_PROJECT" "$SPECKIT_CLI" "$N8N_IMG" "$REPO_DIR" \
  "$REPORT_JSON" "$SCORECARD_MD" "$DAY" "$STAMP" <<'PY'
import json, re, subprocess, sys
from glob import glob
from pathlib import Path

(
    policy_path, outdated_path, audit_path, pkg_json, node_ver,
    speckit_project, speckit_cli, n8n_img, repo_dir, report_path,
    scorecard_path, day, stamp,
) = sys.argv[1:]

policy = json.loads(Path(policy_path).read_text())
outdated = json.loads(Path(outdated_path).read_text() or "{}")
audit = json.loads(Path(audit_path).read_text() or "{}")
pkg = json.loads(pkg_json)
repo = Path(repo_dir)

def rg_count(pattern, path):
    p = repo / path
    if not p.exists():
        return 0
    r = subprocess.run(
        ["rg", "-n", "--count-matches", pattern, str(p)],
        capture_output=True, text=True, check=False,
    )
    total = 0
    for line in (r.stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            # Directory mode: "path:count"; single-file mode: bare "count".
            if ":" in line:
                total += int(line.rsplit(":", 1)[-1])
            else:
                total += int(line)
        except ValueError:
            pass
    return total

def file_lines(path):
    p = repo / path
    return sum(1 for _ in p.open("rb")) if p.is_file() else 0

def expand_braces(pattern: str):
    """Expand a single level of {a,b} braces (Python glob does not)."""
    m = re.search(r"\{([^{}]+)\}", pattern)
    if not m:
        return [pattern]
    opts = m.group(1).split(",")
    return [pattern[: m.start()] + opt + pattern[m.end() :] for opt in opts]

def glob_count(pattern):
    files = set()
    for p in expand_braces(pattern):
        files.update(glob(str(repo / p), recursive=True))
    return len(files)

def zod_route_ratio():
    routes = list((repo / "src/app/api").rglob("route.ts"))
    if not routes:
        return 0.0, 0, 0
    with_zod = 0
    for f in routes:
        text = f.read_text(encoding="utf-8", errors="ignore")
        if any(x in text for x in ("safeParse", "z.object", "from '@/lib/schemas", 'from "@/lib/schemas')):
            with_zod += 1
    return with_zod / len(routes), with_zod, len(routes)

tracks = []
for t in policy.get("qualityTracks", []):
    check = t["check"]
    if check == "rg_count":
        value = rg_count(t["pattern"], t["path"])
        status = "pass" if value <= t.get("targetMax", 0) else "fail"
        detail = f"{value} matches (max {t.get('targetMax', 0)})"
    elif check == "file_lines":
        value = file_lines(t["path"])
        status = "pass" if value <= t.get("targetMax", 10**9) else "fail"
        detail = f"{value} LOC (max {t.get('targetMax')})"
    elif check == "glob_count":
        value = glob_count(t["path"])
        status = "pass" if value >= t.get("targetMin", 0) else "fail"
        detail = f"{value} files (min {t.get('targetMin')})"
    elif check == "zod_route_ratio":
        ratio, with_z, total = zod_route_ratio()
        value = round(ratio, 3)
        status = "pass" if ratio >= t.get("targetMinRatio", 1) else "fail"
        detail = f"{with_z}/{total} = {value:.0%} (min {t.get('targetMinRatio'):.0%})"
    else:
        value, status, detail = None, "unknown", ""
    tracks.append({**t, "status": status, "value": value, "detail": detail})

vuln = (audit.get("metadata") or {}).get("vulnerabilities") or {}
vuln_high = int(vuln.get("high") or 0) + int(vuln.get("critical") or 0)

manual = set(policy.get("manualMajors") or [])
exclude_patch = set((policy.get("autoPatch") or {}).get("exclude") or []) | manual

package_json = json.loads((repo / "package.json").read_text())
all_deps = {**package_json.get("dependencies", {}), **package_json.get("devDependencies", {})}
dead = []
for dep in policy.get("deadDepsSuspect") or []:
    if dep not in all_deps:
        continue
    r = subprocess.run(
        ["rg", "-l", "-g", "!node_modules", rf"from ['\"]{re.escape(dep)}['\"]|require\(['\"]{re.escape(dep)}['\"]\)", "src"],
        cwd=repo, capture_output=True, text=True, check=False,
    )
    if not (r.stdout or "").strip():
        dead.append(dep)

def maj(v):
    m = re.match(r"v?(\d+)", v or "")
    return int(m.group(1)) if m else None

patch_candidates, minor_candidates, major_watch = [], [], []
for name, info in sorted(outdated.items()):
    cur, wanted, latest = str(info.get("current") or ""), str(info.get("wanted") or ""), str(info.get("latest") or "")
    if not cur or not latest:
        continue
    entry = {"name": name, "current": cur, "wanted": wanted, "latest": latest, "type": info.get("type")}
    if maj(cur) is not None and maj(latest) is not None and maj(cur) < maj(latest):
        major_watch.append(entry)
    elif wanted and wanted != cur and name not in exclude_patch:
        patch_candidates.append(entry)
    elif latest != cur:
        minor_candidates.append(entry)

max_pkgs = int((policy.get("autoPatch") or {}).get("maxPackagesPerPr") or 12)
patch_candidates = patch_candidates[:max_pkgs]
fail_tracks = [t for t in tracks if t["status"] == "fail"]
score = max(0, round(10 - len(fail_tracks) * 0.4 - (1.0 if vuln_high else 0) - min(len(major_watch), 5) * 0.15, 1))

report = {
    "ok": True,
    "day": day,
    "checkedAt": stamp,
    "score": score,
    "stack": {
        "node": node_ver,
        "next": pkg.get("next"),
        "react": pkg.get("react"),
        "prisma": pkg.get("prisma"),
        "zod": pkg.get("zod"),
        "nextAuth": pkg.get("nextAuth"),
        "typescript": pkg.get("typescript"),
        "vitest": pkg.get("vitest"),
        "speckitProject": speckit_project,
        "speckitCli": speckit_cli,
        "n8nImage": n8n_img,
        "pins": policy.get("stackPins") or {},
    },
    "vulnerabilities": vuln,
    "vulnHighOrCritical": vuln_high,
    "outdatedCount": len(outdated),
    "patchCandidates": patch_candidates,
    "minorCandidates": minor_candidates[:30],
    "majorWatch": major_watch,
    "deadDeps": dead,
    "qualityTracks": [{"id": t["id"], "title": t["title"], "severity": t["severity"], "status": t["status"], "detail": t["detail"]} for t in tracks],
    "failTracks": [t["id"] for t in fail_tracks],
}

lines = [
    f"# QLMED Scorecard — {day}",
    "",
    f"**Score de higiene:** {score}/10",
    "",
    "## Stack",
    f"- Node `{node_ver}` (pin {policy.get('stackPins', {}).get('node')})",
    f"- Next `{pkg.get('next')}` · React `{pkg.get('react')}` · Prisma `{pkg.get('prisma')}`",
    f"- Zod `{pkg.get('zod')}` · NextAuth `{pkg.get('nextAuth')}` · TS `{pkg.get('typescript')}`",
    f"- Spec Kit projeto `{speckit_project}` / CLI `{speckit_cli}`",
    f"- n8n image `{n8n_img}`",
    "",
    "## Segurança (npm audit, omit=dev)",
    f"- critical/high: **{vuln_high}** · `{json.dumps(vuln)}`",
    "",
    "## Quality tracks",
]
for t in tracks:
    mark = "PASS" if t["status"] == "pass" else "FAIL"
    lines.append(f"- [{mark}] `{t['id']}` ({t['severity']}): {t['title']} — {t['detail']}")
lines += ["", "## Dead deps suspeitas", ""]
lines += [f"- `{d}`" for d in dead] or ["- (nenhuma)"]
lines += ["", f"## Patch candidatos (auto PR, max {max_pkgs})", ""]
lines += [f"- `{e['name']}` {e['current']} → {e['wanted']} (latest {e['latest']})" for e in patch_candidates] or ["- (nenhum)"]
lines += ["", "## Major watch (manual)", ""]
lines += [f"- `{e['name']}` {e['current']} → {e['latest']}" for e in major_watch[:20]] or ["- (nenhum)"]
lines += ["", f"_Gerado por qlmed-app-ci-loop @ {stamp}_", ""]

Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
Path(scorecard_path).write_text("\n".join(lines), encoding="utf-8")
PY

ISSUE_URL=""
PR_URL=""
PR_CREATED=false
ISSUE_UPDATED=false
ACTION="audit"

if [[ "$MODE" == "propose" ]]; then
  ACTION="propose"
  TITLE="CI Loop — scorecard contínuo QLMED"
  BODY="$(cat "$SCORECARD_MD")"$'\n\n---\nIssue mantida pelo CI Loop (n8n).'
  EXISTING="$(gh issue list -R "$REPO_SLUG" --search "$TITLE in:title" --state open --json url,number -q '.[0].url' 2>/dev/null || true)"
  if [[ -n "$EXISTING" ]]; then
    NUM="$(gh issue list -R "$REPO_SLUG" --search "$TITLE in:title" --state open --json number -q '.[0].number')"
    gh issue comment -R "$REPO_SLUG" "$NUM" --body "$BODY" >/dev/null
    ISSUE_URL="$EXISTING"
    ISSUE_UPDATED=true
  else
    ISSUE_URL="$(gh issue create -R "$REPO_SLUG" --title "$TITLE" --body "$BODY" 2>/dev/null)"
    ISSUE_UPDATED=true
  fi

  BRANCH="chore/ci-loop-deps-$DAY"
  OPEN_PR="$(gh pr list -R "$REPO_SLUG" --head "$BRANCH" --state open --json url -q '.[0].url' 2>/dev/null || true)"
  PATCH_COUNT="$(python3 -c 'import json;print(len(json.load(open("'"$REPORT_JSON"'")).get("patchCandidates") or []))')"

  if [[ -n "$OPEN_PR" ]]; then
    PR_URL="$OPEN_PR"
  elif [[ "$PATCH_COUNT" -gt 0 ]]; then
    WT="$WORKTREE_ROOT/$DAY"
    rm -rf "$WT"
    (
      set -euo pipefail
      cd "$REPO_DIR"
      git fetch origin "$BASE_BRANCH" --quiet
      git worktree prune >/dev/null 2>&1 || true
      git branch -D "$BRANCH" >/dev/null 2>&1 || true
      git worktree add -b "$BRANCH" "$WT" "origin/$BASE_BRANCH" >/dev/null
    ) >&2

    (
      set -euo pipefail
      cd "$WT"
      # shellcheck disable=SC1091
      . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
      nvm use 22 >/dev/null 2>&1 || true
      mapfile -t PKGS < <(python3 -c 'import json;print("\n".join(x["name"] for x in json.load(open("'"$REPORT_JSON"'"))["patchCandidates"]))')
      [[ "${#PKGS[@]}" -gt 0 ]] || exit 0
      npm update "${PKGS[@]}" >/tmp/qlmed-ci-loop-npm.log 2>&1 || true
      mkdir -p docs/scorecard
      cp "$SCORECARD_MD" docs/scorecard/LATEST.md
      cp "$REPORT_JSON" docs/scorecard/latest.json
      git add package.json package-lock.json docs/scorecard/LATEST.md docs/scorecard/latest.json
      if git diff --cached --quiet; then
        echo "sem diff" >&2
        exit 0
      fi
      git commit -m "chore(deps): CI Loop patch bump $DAY" >/dev/null
      git push -u origin "$BRANCH" >/dev/null
    ) >&2

    if git -C "$REPO_DIR" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
      PR_URL="$(gh pr create -R "$REPO_SLUG" --base "$BASE_BRANCH" --head "$BRANCH" \
        --title "chore(deps): CI Loop patch bump $DAY" \
        --body "$(cat <<EOF
## Summary
- Patch/minor seguros do CI Loop ($DAY)
- Scorecard em \`docs/scorecard/LATEST.md\`
- Issue: ${ISSUE_URL}

Sem majors Next/Prisma/React. Sem auto-merge.

> \`qlmed-app-ci-loop.sh\` / n8n \`qlmedCiLoop01\`
EOF
)" 2>/dev/null || true)"
      [[ -n "$PR_URL" ]] && PR_CREATED=true
    fi
    (
      cd "$REPO_DIR"
      git worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"
    ) >&2 || true
  fi
fi

python3 - "$REPORT_JSON" "$ACTION" "$MODE" "$ISSUE_URL" "$PR_URL" "$PR_CREATED" "$ISSUE_UPDATED" "$AS_JSON" "$SCORECARD_MD" <<'PY'
import json, sys
from pathlib import Path
report_path, action, mode, issue, pr, pr_created, issue_updated, as_json, scorecard = sys.argv[1:]
report = json.loads(Path(report_path).read_text())
report.update({
    "action": action,
    "mode": mode,
    "issueUrl": issue,
    "prUrl": pr,
    "prCreated": pr_created == "true",
    "issueUpdated": issue_updated == "true",
    "scorecardPath": scorecard,
    "reportPath": report_path,
})
report["notify"] = bool(
    report.get("failTracks")
    or report.get("vulnHighOrCritical")
    or report.get("deadDeps")
    or report.get("prCreated")
    or report.get("majorWatch")
    or (report.get("patchCandidates") and action == "propose")
)
Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
if as_json == "1":
    print(json.dumps(report, ensure_ascii=False))
else:
    print(f"[{action}] score={report['score']} issue={issue} pr={pr}")
PY
