---
phase: quick-260410-rvi
plan: 01
subsystem: invoice-viewer
tags: [mobile, ux, danfe, fiscal, bugfix]
requirements:
  - QUICK-260410-rvi
dependency_graph:
  requires: []
  provides:
    - mobile-danfe-placeholder
  affects:
    - src/components/InvoiceDetailsModal.tsx
tech_stack:
  added: []
  patterns:
    - window.matchMedia responsive detection with SSR-safe default
    - Theme-aware label via DOC_THEME.pdfLabel
key_files:
  created: []
  modified:
    - src/components/InvoiceDetailsModal.tsx
decisions:
  - "matchMedia('(max-width: 767px)') chosen over user-agent sniffing — reliable viewport-based and reacts to resize"
  - "Default isMobile=false to avoid SSR/client hydration mismatch on desktop"
  - "Reuse theme.pdfLabel so label switches between 'Abrir DANFE' / 'Abrir DACTE' / 'Abrir PDF' per doc type"
metrics:
  duration_seconds: 71
  tasks_completed: 1
  tasks_total: 2
  files_changed: 1
  completed_date: "2026-04-10"
status: awaiting-human-verification
---

# Quick Task 260410-rvi: Fix Mobile DANFE Viewing in InvoiceDetailsModal — Summary

**One-liner:** Replace broken mobile PDF iframe with themed placeholder card and "Abrir DANFE" button using `window.matchMedia('(max-width: 767px)')`, preserving desktop iframe behavior.

## What Was Built

On mobile viewports (<768px), the `InvoiceDetailsModal` DANFE view no longer renders a blank/broken `<iframe>` pointing at `/api/invoices/{id}/pdf`. It now renders a centered placeholder card with:

- A themed 64×64 icon badge (primary for NF-e, teal for CT-e, violet for NFS-e) using `picture_as_pdf` Material Symbol
- Heading "Visualização indisponível"
- Portuguese explanatory text naming the document label (DANFE/DACTE/PDF)
- A primary-gradient "Abrir {DANFE|DACTE|PDF}" button that calls `window.open(pdfUrl, '_blank')` to open the PDF in a new tab

On desktop (≥768px), the iframe block is rendered exactly as before — byte-equivalent behavior, no visual regression.

Mobile detection is implemented inline via `useState(false)` + `useEffect` attaching a `matchMedia('(max-width: 767px)')` listener that updates reactively on viewport changes (including DevTools resize across the 768px boundary).

## Tasks

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Add mobile detection state and conditional DANFE rendering | Complete | `f7c95c9` |
| 2 | Verify mobile and desktop DANFE rendering (human-verify) | **Pending human verification** | — |

### Task 1: Add mobile detection state and conditional DANFE rendering

**File modified:** `src/components/InvoiceDetailsModal.tsx`

**Edit 1 — Mobile detection (around line 128):**
Added `const [isMobile, setIsMobile] = useState(false)` alongside the existing state hooks, plus a dedicated `useEffect` that:
- Guards against SSR via `typeof window === 'undefined'` early-return
- Creates a `MediaQueryList` for `(max-width: 767px)`
- Sets initial state and subscribes via `addEventListener('change', ...)`
- Cleans up the listener on unmount

**Edit 2 — Conditional DANFE rendering (around line 362):**
Wrapped the existing iframe block in an `isMobile ? placeholder : iframe` ternary inside the `view === 'danfe' ?` branch. The placeholder reuses:
- Existing `theme` (from `DOC_THEME[meta?.type]`) for gradient/ring/text/pdfLabel consistency with the header
- The same gradient/shadow styling as the existing "Imprimir" button (lines ~311-316) for visual consistency
- `bg-white dark:bg-card-dark` card surface matching the mobile footer (line ~418)
- `window.open(pdfUrl, '_blank')` matching the existing pattern at lines 156/160

**Verification results:**
- `npx tsc --noEmit -p tsconfig.json` → no type errors in `InvoiceDetailsModal`
- Grep confirmed all 4 done-criteria strings present:
  - `const [isMobile, setIsMobile] = useState(false)` (line 128)
  - `window.matchMedia('(max-width: 767px)')` (line 132)
  - `window.open(pdfUrl, '_blank')` (line 378)
  - `Abrir {theme.pdfLabel}` (line 382)
- No changes to `InvoiceDetailsModalProps`, component export, or XML view branch
- No new imports added (`useState, useEffect, useMemo` already imported from 'react')

### Task 2: Verify mobile and desktop DANFE rendering — AWAITING HUMAN VERIFICATION

This task is a `checkpoint:human-verify` gate. Task 1 is code-complete and committed, but the plan requires human confirmation of runtime behavior before declaring the fix done.

**Human verification steps** (from plan):

**Start dev server:**
```bash
qldev
# or: cd ~/QLMED/dev && export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22 && PORT=3001 npm run dev
```

**Desktop regression check (behavior MUST be unchanged):**
1. Open `http://localhost:3001` (or `http://100.83.11.58:3001` via Tailscale) at full desktop width
2. Log in and navigate to fiscal/invoices panel
3. Click any **issued NF-e** → `InvoiceDetailsModal` opens
4. Confirm DANFE view renders the iframe with PDF inline, exactly as before
5. Toggle to XML view — syntax-highlighted XML must still render
6. Also open a **received NF-e** (HTML preview), plus a **CT-e** and **NFS-e** if available

**Mobile verification (the fix):**
1. Open Chrome/Firefox DevTools device toolbar (Ctrl+Shift+M), pick a mobile preset (iPhone 12, Pixel 7) — viewport <768px
2. Reload the page
3. Open an **issued NF-e**
4. Confirm the DANFE view shows:
   - A centered card (not an iframe, not blank)
   - Colored icon badge (`picture_as_pdf`) matching doc-type theme (primary/teal/violet)
   - Heading "Visualização indisponível"
   - Portuguese text mentioning the document label (DANFE/DACTE/PDF)
   - Primary gradient button labeled "Abrir DANFE" (or "Abrir DACTE" / "Abrir PDF")
5. Tap "Abrir DANFE" → a new tab opens loading `/api/invoices/{id}/pdf`
6. Toggle XML view in header — must still work normally
7. Resize DevTools viewport across 768px — view reactively switches between iframe and placeholder

**Real device check (recommended):**
Load `http://100.83.11.58:3001` from an actual phone via Tailscale. Open an issued NF-e and confirm:
- Placeholder card appears (not blank iframe or forced download)
- Tapping "Abrir DANFE" opens the PDF in the native mobile browser

**Expected outcome:** Desktop unchanged, mobile shows actionable placeholder, no React hydration warnings in the console.

**Resume signal:** Type "approved" or describe any issues observed (hydration warnings, wrong breakpoint, button styling off, theme label incorrect).

## Deviations from Plan

None — Task 1 executed exactly as written. No bugs, missing functionality, or blocking issues discovered. No new imports, no new files, no prop changes.

## Must-Haves Status

| Truth | Status |
|-------|--------|
| Mobile (<768px) does NOT render iframe for issued NF-e | Code-complete, pending human verify |
| Mobile shows placeholder card with icon, pt-BR text, "Abrir DANFE" button | Code-complete, pending human verify |
| "Abrir DANFE" on mobile opens existing pdfUrl in new tab | Code-complete, pending human verify |
| Desktop (≥768px) DANFE view continues to render iframe unchanged | Code-complete, pending human verify |
| SSR defaults to desktop to avoid hydration mismatch | Verified in code (`useState(false)`, effect only runs client-side) |
| XML view completely unaffected | Verified in code (no edits to XML branch) |

## Decisions Made

1. **matchMedia over user-agent sniffing** — The plan specified `window.matchMedia('(max-width: 767px)')`. This is more reliable than UA sniffing (handles DevTools resize, tablets in split-screen, etc.) and is what Next.js 15 / modern browsers support natively.
2. **SSR-safe default** — `useState(false)` ensures server renders the desktop iframe, then the client effect reconciles after mount. Avoids the hydration mismatch warning that would occur if the server rendered the placeholder while the client expected an iframe (or vice versa).
3. **Reuse `theme.pdfLabel`** — The button label dynamically matches the doc type ("Abrir DANFE" for NF-e, "Abrir DACTE" for CT-e, "Abrir PDF" for NFS-e) using the same `DOC_THEME` map already driving the header label. No new label constants needed.
4. **767px breakpoint** — Chose 767px (not 768px) because `max-width` in `matchMedia` is inclusive; this exactly matches Tailwind's `md:` breakpoint boundary (md = 768px and up).
5. **Reused existing styling tokens** — Button gradient/shadow matches the "Imprimir" header button; card surface matches the mobile footer. No new design tokens introduced.

## Known Stubs

None. The mobile placeholder card is fully functional — it wires directly to `pdfUrl` which was already implemented and is the same URL the desktop iframe uses.

## Deferred Issues

None.

## Authentication Gates

None.

## Commits

| Hash | Task | Message |
|------|------|---------|
| `f7c95c9` | Task 1 | `fix(quick-260410-rvi-01): render mobile placeholder for DANFE view` |

## Self-Check: PASSED

- [x] `src/components/InvoiceDetailsModal.tsx` exists and contains the modifications (verified via Grep)
- [x] Commit `f7c95c9` exists (verified via `git rev-parse --short HEAD`)
- [x] `const [isMobile, setIsMobile] = useState(false)` present at line 128
- [x] `window.matchMedia('(max-width: 767px)')` present at line 132
- [x] `window.open(pdfUrl, '_blank')` present at line 378 (inside danfe view branch)
- [x] `Abrir {theme.pdfLabel}` present at line 382
- [x] TypeScript check passed with no errors in `InvoiceDetailsModal.tsx`
- [x] Task 2 documented as pending human verification (checkpoint gate)
