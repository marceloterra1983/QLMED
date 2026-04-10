---
phase: 10-major-upgrades
plan: 01
subsystem: tooling
tags: [eslint, flat-config, devDependencies, linting]
dependency_graph:
  requires: []
  provides: [eslint-9-flat-config]
  affects: [lint-script, ci-pipeline]
tech_stack:
  added: [eslint@9, eslint-config-next@15, "@eslint/eslintrc"]
  patterns: [flat-config, FlatCompat]
key_files:
  created: [eslint.config.mjs]
  modified: [package.json, package-lock.json, src/app/(painel)/cadastro/produtos/page-client.tsx]
  deleted: [.eslintrc.json, .eslintignore]
decisions:
  - Used FlatCompat from @eslint/eslintrc to bridge eslint-config-next (legacy format) to flat config
  - Changed lint script from "next lint" to "eslint ." because Next.js 14 does not support ESLint 9 flat config
  - Merged .eslintignore entries into eslint.config.mjs ignores block
metrics:
  duration: 326s
  completed: "2026-04-10T04:24:44Z"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 6
---

# Phase 10 Plan 01: ESLint 8 to 9 Upgrade Summary

ESLint 9 with flat config (eslint.config.mjs) using FlatCompat bridge for eslint-config-next/core-web-vitals compatibility.

## What Was Done

### Task 1: Upgrade ESLint to v9 and migrate to flat config
**Commit:** `2003116`

- Installed `eslint@9.39.4`, `eslint-config-next@15.5.15`, `@eslint/eslintrc@3.3.5`
- Created `eslint.config.mjs` with FlatCompat wrapper for `next/core-web-vitals`
- Deleted `.eslintrc.json` (legacy config) and `.eslintignore` (merged into flat config ignores)
- Updated `package.json` lint script from `next lint` to `eslint .` (Next.js 14's `next lint` does not support ESLint 9 flat config)
- Removed an unused `eslint-disable` directive in `page-client.tsx` that was no longer triggering
- Used `--legacy-peer-deps` during install due to `next-auth@4` optional peer dep on `nodemailer@^7`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] lint script incompatibility with Next.js 14**
- **Found during:** Task 1, step 6
- **Issue:** `next lint` (from Next.js 14) does not recognize `eslint.config.mjs` flat config and prompts for interactive setup
- **Fix:** Changed lint script from `next lint` to `eslint .`
- **Files modified:** package.json

**2. [Rule 3 - Blocking] .eslintignore not supported in ESLint 9**
- **Found during:** Task 1, step 6
- **Issue:** ESLint 9 warns that `.eslintignore` is deprecated; ignores must be in flat config
- **Fix:** Merged all `.eslintignore` entries into `eslint.config.mjs` ignores block and deleted `.eslintignore`
- **Files modified:** eslint.config.mjs
- **Files deleted:** .eslintignore

**3. [Rule 1 - Bug] Unused eslint-disable directive**
- **Found during:** Task 1, step 6
- **Issue:** `eslint-disable-line react-hooks/exhaustive-deps` in page-client.tsx no longer needed (rule not triggering)
- **Fix:** Removed the directive
- **Files modified:** src/app/(painel)/cadastro/produtos/page-client.tsx

## Verification Results

- `npx eslint --version` -> v9.39.4
- `.eslintrc.json` deleted (confirmed not found)
- `.eslintignore` deleted (confirmed not found)
- `eslint.config.mjs` exists with `export default`
- `npm run lint` passes clean (zero errors, zero warnings)
- `npm run build` passes successfully

## Known Stubs

None.

## Notes

- When Next.js is upgraded to 15+ (Plan 10-02), `next lint` will natively support flat config. At that point, the lint script can optionally be changed back to `next lint` if desired, though `eslint .` will continue to work.
- The `--legacy-peer-deps` flag was needed due to `next-auth@4` having an optional peer dependency on `nodemailer@^7`, while the project uses `nodemailer@^8`.
