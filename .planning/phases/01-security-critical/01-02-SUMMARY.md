---
phase: 01-security-critical
plan: 02
subsystem: middleware-rate-limiting
tags: [security, rate-limiting, edge-runtime, middleware]
dependency_graph:
  requires: []
  provides: [rate-limit-utility, middleware-rate-limiting]
  affects: [src/middleware.ts]
tech_stack:
  added: []
  patterns: [Map-based-sliding-window, lazy-cleanup]
key_files:
  created:
    - src/lib/rate-limit.ts
  modified:
    - src/middleware.ts
decisions:
  - Map-based rate limiter over npm packages for Edge Runtime compatibility
  - Rate limiting before auth checks to block brute-force before JWT validation
  - Per-IP + per-path keying for granular rate control
metrics:
  duration: 63s
  completed: "2026-04-10T01:10:22Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 01 Plan 02: Rate Limiting Summary

IP-based rate limiting via Edge-compatible Map sliding window -- login 5/min, upload 10/min, webhook 60/min, enforced before auth in middleware.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Create rate limiting utility for Edge Runtime | 2ac9629 | Created `src/lib/rate-limit.ts` with Map-based sliding window, lazy cleanup, pre-configured limits |
| 2 | Integrate rate limiting into middleware | e70c9ee | Added rate limit check before auth in `src/middleware.ts`, HTTP 429 with Portuguese error |

## What Was Built

### Rate Limit Utility (`src/lib/rate-limit.ts`)
- `checkRateLimit(key, config)` -- sliding window rate limiter using `Map<string, RateLimitEntry>`
- Lazy cleanup every 100 calls to prevent unbounded Map growth
- `getRateLimitHeaders()` -- returns `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers
- Pre-configured `RATE_LIMITS` object: login (5/min), upload (10/min), webhook (60/min)
- Zero npm dependencies, fully Edge Runtime compatible

### Middleware Integration (`src/middleware.ts`)
- Rate limiting runs as FIRST check in middleware, before API key and JWT validation
- Client IP extracted from `x-forwarded-for` > `x-real-ip` > `req.ip` > `'unknown'`
- Rate limit key is `{ip}:{pathname}` for per-endpoint granularity
- Exceeded limits return HTTP 429 with `{ error: 'Muitas tentativas. Tente novamente mais tarde.' }`
- Matcher config unchanged (expansion handled in Plan 03)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Decisions Made

1. **Map over LRU library** -- Edge Runtime restricts npm packages; plain Map with lazy cleanup is simpler and fully compatible.
2. **Rate limit before auth** -- Blocking brute-force attempts before JWT validation prevents wasted crypto operations.
3. **Per-path keying** -- Using `{ip}:{pathname}` ensures limits apply per-endpoint, not globally per IP.

## Self-Check: PASSED
