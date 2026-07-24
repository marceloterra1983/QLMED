---
phase: 01-security-critical
plan: 01
subsystem: authentication
tags: [security, auth, env-vars, logging]
dependency_graph:
  requires: []
  provides: [pin-auth-env-var, failed-login-logging]
  affects: [login-flow]
tech_stack:
  added: []
  patterns: [env-var-config, structured-logging]
key_files:
  created: []
  modified:
    - src/lib/auth-options.ts
decisions:
  - PIN_MAP loaded via getPinMap() with lazy JSON.parse from env var
  - Failed login logging uses console.warn with structured object (type, email, timestamp)
  - IP not logged because NextAuth CredentialsProvider authorize() has no request access
metrics:
  duration: 89s
  completed: "2026-04-10T01:11:21Z"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 01 Plan 01: Move PIN_MAP to Env Var Summary

PIN authentication map moved from hardcoded constant to PIN_MAP_JSON env var with JSON.parse and error handling; failed login attempts logged with type/email/timestamp on all three failure paths.

## What Was Done

### Task 1: Move PIN_MAP to env var and add failed login logging

- Removed hardcoded `PIN_MAP` constant containing 7 user PINs and emails
- Added `getPinMap()` function that reads and parses `process.env.PIN_MAP_JSON` with try/catch
- Returns empty object if env var missing or malformed (graceful degradation)
- Updated `authorize()` to call `getPinMap()` instead of referencing static constant
- Added `console.warn('[Auth] Failed login attempt', {...})` before each `throw new Error(...)` in three failure paths:
  1. No email resolved (invalid PIN, no email provided)
  2. User not found in database
  3. Bcrypt password mismatch
- Added `PIN_MAP_JSON` to dev `.env` and production `env/app.env`
- Commit: `e89c2d0`

## Verification Results

| Check | Result |
|-------|--------|
| No hardcoded PINs in auth-options.ts | PASS |
| Uses PIN_MAP_JSON env var | PASS (2 references) |
| Logs failed login attempts | PASS (3 logging points) |
| PIN_MAP_JSON in dev .env | PASS |
| PIN_MAP_JSON in production app.env | PASS |
| TypeScript compilation (auth-options.ts) | PASS (no errors) |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
