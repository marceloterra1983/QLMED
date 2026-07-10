---
phase: 02-dependency-fixes
plan: 01
subsystem: dependencies
tags: [security, dependencies, cve-fix]
dependency_graph:
  requires: []
  provides: [DEP-01, DEP-02, DEP-03, DEP-05]
  affects: [package.json, package-lock.json]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified: [package.json, package-lock.json]
decisions:
  - "Remaining 5 high vulns are from next (3), glob/eslint-config-next (1), xlsx (2) -- all require major version upgrades handled in later phases (UPG-01, DEP-04)"
  - "Used --legacy-peer-deps for nodemailer v8 due to next-auth optional peer dependency on nodemailer ^7 (not used for email provider)"
  - "Moved @types/nodemailer from dependencies to devDependencies"
metrics:
  duration: 257s
  completed: "2026-04-10T01:44:55Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 02 Plan 01: Dependency Updates and CVE Fixes Summary

Updated node-forge 1.3.3->1.4.0 (4 CVE fixes including signature forgery), nodemailer 7->8.0.5 (SMTP injection fix), removed unused html-to-image, and ran npm audit fix for transitive vulnerabilities.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | npm audit fix + remove html-to-image + update node-forge + nodemailer | 11a53ea | Updated node-forge, nodemailer v8, removed html-to-image, moved @types/nodemailer to devDeps |
| 2 | Verify node-forge and nodemailer usage compiles | (no changes) | npm run build passes, zero TS errors in certificate-manager.ts and valvulas route |

## Verification Results

- node-forge updated: 1.3.3 -> 1.4.0 (fixes CVE signature forgery + 3 others)
- nodemailer updated: 7.0.13 -> 8.0.5 (fixes SMTP injection via CRLF)
- html-to-image: removed from package.json (zero imports in codebase)
- @types/nodemailer: updated to v8, moved to devDependencies
- npm audit fix: applied for transitive vulnerabilities
- npm run build: passes successfully
- tsc --noEmit: zero errors in certificate-manager.ts, valvulas route
- Remaining 5 high vulns: next.js (3), glob/eslint-config-next (1), xlsx (2) -- all require breaking major upgrades, handled in UPG-01 and DEP-04

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Moved @types/nodemailer to devDependencies**
- **Found during:** Task 1
- **Issue:** @types/nodemailer was in dependencies (wrong section for a type package)
- **Fix:** Moved to devDependencies where it belongs alongside other @types/* packages
- **Files modified:** package.json

**2. [Rule 3 - Blocking] Used --legacy-peer-deps for npm install**
- **Found during:** Task 1
- **Issue:** next-auth@4.24.13 has peerOptional dependency on nodemailer@^7.0.7, conflicting with nodemailer@8
- **Fix:** Used --legacy-peer-deps since next-auth's email provider is not used (nodemailer is only used directly in valvulas report route)
- **Files modified:** package-lock.json

## Known Stubs

None.

## Decisions Made

1. Remaining high vulnerabilities from next.js, glob, and xlsx are out of scope -- they require major version upgrades handled in UPG-01 (Next.js 14->15+) and DEP-04 (xlsx replacement with exceljs)
2. next-auth's optional peer dependency on nodemailer ^7 is safely overridden since we don't use next-auth's built-in email provider
3. @types/nodemailer moved to devDependencies where type packages belong

## Self-Check: PASSED
