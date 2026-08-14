---
name: ponytail-qlmed
description: Runs Ponytail on the QLMED app checkout — default whole-repo over-engineering audit (YAGNI/stdlib/native). Use when the user says /ponytail, /ponytail-qlmed, "roda ponytail", or "ponytail no QLMED".
disable-model-invocation: true
---

# Ponytail no QLMED

Read and follow the plugin skills `ponytail` and `ponytail-audit` first (and `ponytail-review` if the user asked for a diff review). Then run them on this repo.

## Where

Canonical git checkout only: `~/qlmed/app` (or this repo root if `AGENTS.md` + `.specify/memory/constitution.md` are here). Ignore `node_modules`, `.git`, `public/pdfjs`, runners, `/srv`, `~/qlmed/runtime`, `~/qlmed/production`, `.env`, backups.

Do not read, print, or commit `.env` or backups. Do not deploy, migrate, or touch production.

## What to run

- No extra text, or `audit`: **ponytail-audit** on `src/`, `prisma/schema.prisma`, `scripts/` (app code), plus `docs/` / `specs/` only for duplicated process, not for rewriting ADRs.
- `review`: **ponytail-review** on `git diff origin/main` (or the stated branch).
- `lite` | `full` | `ultra`: set Ponytail intensity, then audit.

Do not apply deletions unless the user says `aplicar` or `fix`.

## Do not flag as bloat

Constitution I–V: executable tests, server-side auth, company isolation helpers, versioned Prisma migrations, bounded integration timeouts, secret/fiscal-XML log containment. A single focused test for non-trivial logic is the Ponytail minimum, not debt.

## Output

One line per finding, biggest cut first: `<tag> <what to cut>. <replacement>. [path]`

Tags: `delete:` `stdlib:` `native:` `yagni:` `shrink:`

End with `net: -<N> lines, -<M> deps possible.` Nothing to cut: `Lean already. Ship.`
