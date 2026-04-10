---
phase: quick-260410-swk
plan: 01
subsystem: fiscal-ui
tags: [mobile, pdfjs, danfe, invoice-modal, static-assets, revert]
one-liner: Mobile DANFE via Mozilla PDF.js v4.8.69 legacy dist served same-origin, with backend s81 HTML shortcut reverted
status: awaiting-human-verify
requirements:
  - QUICK-260410-swk
dependency-graph:
  requires:
    - 260410-rvi (isMobile + matchMedia machinery in InvoiceDetailsModal)
    - 260410-s81 (HTML shortcut that is now being reverted)
  provides:
    - Real PDF rendering on mobile via PDF.js canvas viewer
    - Same-origin PDF.js assets at /pdfjs/*
  affects:
    - src/app/api/invoices/[id]/pdf/route.ts (reverted to pre-s81)
    - src/components/InvoiceDetailsModal.tsx (mobile iframeSrc only)
    - public/pdfjs/ (new tree, 376 files, ~20MB)
tech-stack:
  added:
    - "Mozilla PDF.js v4.8.69 legacy dist (static asset drop, NOT an npm dep)"
  patterns:
    - "Same-origin static asset serving for cookie-authenticated PDF fetch"
    - "Viewport-based iframe src switching (isMobile gate at 768px)"
key-files:
  created:
    - public/pdfjs/ (376 files: build/, web/, LICENSE)
  modified:
    - src/app/api/invoices/[id]/pdf/route.ts
    - src/components/InvoiceDetailsModal.tsx
decisions:
  - "PDF.js v4.8.69 legacy dist chosen for mobile browser compatibility (non-legacy dist requires modern ES features not present on older mobile Chrome/Safari)"
  - "encodeURIComponent(pdfUrl) on the ?file= param to handle future query-string growth safely"
  - "No package.json dependency — drop is a static asset, keeps bundle size and build time untouched"
  - "No next.config.mjs/CSP changes — existing default-src 'self' + script-src 'unsafe-eval' + worker-src 'self' already covers PDF.js"
  - "Sample PDF web/compressed.tracemonkey-pldi-09.pdf left unstaged (blocked by pre-existing *.pdf .gitignore rule) — not required because viewer always receives ?file= param"
metrics:
  duration: 152s
  tasks_completed: 2
  tasks_total: 3
  files_modified: 378
  completed_date: "2026-04-10"
---

# Quick Task 260410-swk: Option D — PDF.js Standalone Viewer for Mobile DANFE — Summary

## What Was Built

Two-step pivot off the 260410-s81 HTML fallback approach that users rejected in favor of a real PDF viewer on mobile:

1. **Static asset drop**: Extracted the full Mozilla PDF.js v4.8.69 legacy dist into `public/pdfjs/`. This gives us `viewer.html`, `pdf.mjs`, `pdf.worker.mjs`, all locale files, all toolbar SVG icons, and the bcmap/standard_fonts/cmaps directories that PDF.js needs to render arbitrary PDFs. Same-origin serving means auth cookies on the `/api/invoices/:id/pdf` route flow automatically when PDF.js fetches the document.

2. **Backend revert + frontend switch**: Reverted `src/app/api/invoices/[id]/pdf/route.ts` to its pre-260410-s81 state (removed the `format=html` + `forceHtml` shortcut) so the route always returns PDF/HTML per the pre-s81 branching. In `src/components/InvoiceDetailsModal.tsx`, swapped the single `iframeSrc` line so that on mobile (`<768px`) the iframe loads `/pdfjs/web/viewer.html?file=<encoded pdfUrl>`, while desktop continues to load the raw `pdfUrl` for the native browser viewer. The 260410-rvi `isMobile` state and `matchMedia` listener were preserved unchanged, and the `handlePrint` / `handleDownloadPdf` handlers still hit the raw PDF URL with `?print=true` / `?download=true` on both platforms.

## PDF.js Version & Source

| Property | Value |
|----------|-------|
| Library | Mozilla PDF.js |
| Version | **v4.8.69** (legacy dist) |
| Source URL | https://github.com/mozilla/pdf.js/releases/download/v4.8.69/pdfjs-4.8.69-legacy-dist.zip |
| Download method | `curl -fsSL` into `/tmp/pdfjs.zip`, then extracted via `python3 -c "import zipfile; ..."` (server has no `unzip`) |
| Target directory | `public/pdfjs/` (flat, no nested `pdfjs-4.8.69-legacy-dist/` subdir — zip extracted directly to top level) |
| Uncompressed size | ~20 MB (376 files) |
| Compressed (zip) size | ~6 MB |

## public/pdfjs/ File Tree

```
public/pdfjs/
├── LICENSE                                 # Apache 2.0
├── build/                                  # 6 files
│   ├── pdf.mjs                             # Core PDF.js module
│   ├── pdf.mjs.map
│   ├── pdf.sandbox.mjs                     # Sandbox helper
│   ├── pdf.sandbox.mjs.map
│   ├── pdf.worker.mjs                      # Worker module
│   └── pdf.worker.mjs.map
└── web/                                    # 11 top-level entries
    ├── cmaps/                              # 169 files — CJK character maps (bcmap)
    ├── debugger.css
    ├── debugger.mjs
    ├── images/                             # 66 SVG icons — toolbar, annotation, cursor, editor
    ├── locale/                             # 112 locales (incl. pt-BR, en-US) — viewer.ftl + locale.json
    ├── standard_fonts/                     # 16 files — FoxitDingbats, LiberationSans-* (ttf), licenses
    ├── viewer.css                          # PDF.js viewer stylesheet (~5000 lines)
    ├── viewer.html                         # Viewer entry point — this is what the iframe loads
    ├── viewer.mjs                          # Viewer UI logic (~19k lines)
    └── viewer.mjs.map
```

**Counts:** build/ = 6, web/cmaps/ = 169, web/images/ = 66, web/locale/ = 112, web/standard_fonts/ = 16, web/ top-level = 11 entries, plus LICENSE.

**Total files committed: 376** (376 additions in Task 1 commit).

**Not committed:** `public/pdfjs/web/compressed.tracemonkey-pldi-09.pdf` — the PDF.js sample PDF bundled with the release. It is excluded by the pre-existing `*.pdf` rule in `.gitignore` line 53. This file is not functionally required because our viewer is always invoked with `?file=<our api url>` — the sample PDF is only used if you open `viewer.html` with no `file` param. See Deviations section below.

## Commits

| # | Task                                                           | Type  | Hash      | Files |
|---|----------------------------------------------------------------|-------|-----------|-------|
| 1 | Drop PDF.js v4.8.69 legacy dist into public/pdfjs/             | chore | `84cfb84` | 376   |
| 2 | Revert route.ts s81 shortcut + switch mobile iframe to PDF.js  | feat  | `17554d9` | 2     |

Both commits on `main` off of parent `d015d49` (the last 260410-s81 docs commit).

## Revert Diff vs 260410-s81

**`src/app/api/invoices/[id]/pdf/route.ts`** — Task 2 commit `17554d9` reverses the s81 changes introduced by commit `d9b555e`:

```diff
     const url = new URL(req.url);
     const autoPrint = url.searchParams.get('print') === 'true';
     const download = url.searchParams.get('download') === 'true';
-    const format = url.searchParams.get('format');
-    const forceHtml = format === 'html' && !!invoice.xmlContent;
-
-    const originalIssuedPdf = forceHtml
-      ? null
-      : await getOriginalIssuedPdf({
-          companyId: invoice.companyId,
-          type: invoice.type,
-          direction: invoice.direction,
-          number: invoice.number,
-          issueDate: invoice.issueDate,
-        });
+
+    const originalIssuedPdf = await getOriginalIssuedPdf({
+      companyId: invoice.companyId,
+      type: invoice.type,
+      direction: invoice.direction,
+      number: invoice.number,
+      issueDate: invoice.issueDate,
+    });
```

Everything else in `route.ts` (imports, Puppeteer download path, HTML generator branches for NFE/CTE/NFSE, fallback, logger, error handling, headers) is untouched.

**`src/components/InvoiceDetailsModal.tsx`** — Task 2 commit `17554d9` reverses the single-line s81 change from commit `cb65357`:

```diff
-  const iframeSrc = isMobile ? `${pdfUrl}?format=html` : pdfUrl;
+  const iframeSrc = isMobile
+    ? `/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`
+    : pdfUrl;
```

Everything else in the modal (isMobile state, matchMedia useEffect, pdfUrl constant, handlePrint, handleDownloadPdf, handleDownloadXml, XML view branch, DOC_THEME, header, footer, iframe element) is byte-identical.

## Verification Evidence

### Task 1 — PDF.js asset drop

```bash
$ test -f public/pdfjs/web/viewer.html && echo OK
OK
$ test -f public/pdfjs/build/pdf.mjs && echo OK
OK
$ test -f public/pdfjs/build/pdf.worker.mjs && echo OK
OK
$ test -f public/pdfjs/LICENSE && echo OK
OK
$ ls public/pdfjs/
build  LICENSE  web
$ du -sh public/pdfjs/
20M     public/pdfjs/
```

No nested `pdfjs-4.8.69-legacy-dist/` directory. `/tmp/pdfjs.zip` cleaned up.

### Task 2 — grep sanity checks

```bash
# Must return 0 lines each
$ grep -n "format === 'html'" src/app/api/invoices/\[id\]/pdf/route.ts
(no output)
$ grep -n "forceHtml" src/app/api/invoices/\[id\]/pdf/route.ts
(no output)
$ grep -n "format=html" src/components/InvoiceDetailsModal.tsx
(no output)

# Must return 1 line each
$ grep -n "/pdfjs/web/viewer.html" src/components/InvoiceDetailsModal.tsx
165:    ? `/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`
$ grep -n "encodeURIComponent(pdfUrl)" src/components/InvoiceDetailsModal.tsx
165:    ? `/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`
$ grep -n "pdfUrl}?print=true" src/components/InvoiceDetailsModal.tsx
169:    window.open(`${pdfUrl}?print=true`, '_blank');
$ grep -n "pdfUrl}?download=true" src/components/InvoiceDetailsModal.tsx
173:    window.open(`${pdfUrl}?download=true`, '_blank');
$ grep -n "matchMedia('(max-width: 767px)')" src/components/InvoiceDetailsModal.tsx
132:    const mq = window.matchMedia('(max-width: 767px)');
```

All seven assertions pass.

### TypeScript check on modified files

```bash
$ npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(route\.ts|InvoiceDetailsModal\.tsx)"
no errors in modified files
```

No new type errors in `src/app/api/invoices/[id]/pdf/route.ts` or `src/components/InvoiceDetailsModal.tsx`.

### Untouched files

```bash
$ git diff --stat package.json next.config.mjs
(empty — both untouched)
```

## Decisions Made

1. **v4.8.69 legacy dist over modern dist** — the legacy ES5-compatible build works on older mobile Chrome and iOS Safari versions still in use. The modern dist requires ES2021+ features not yet universal on mobile.
2. **Static asset drop vs npm dependency** — adding `pdfjs-dist` to `package.json` would pull ~20MB into `node_modules`, require bundler-specific worker-loader config in Next.js, and increase build time. A static asset drop under `public/` bypasses all of that: the files are served directly by Next.js's static file handler, no bundling required.
3. **`encodeURIComponent(pdfUrl)` on the `?file=` param** — the current `pdfUrl` is `/api/invoices/:id/pdf` with no query string, so encoding only turns `/` into `%2F`. But wrapping in `encodeURIComponent` future-proofs the call if we ever add query params to the base URL.
4. **Same-origin serving for cookie auth** — because `/pdfjs/*` and `/api/invoices/:id/pdf` are on the same origin, when PDF.js internally `fetch()`es the `?file=` URL, the browser sends the NextAuth JWT cookie automatically. No token plumbing, no CORS, no CSP changes needed.
5. **No CSP / next.config.mjs changes** — current CSP (`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self'`) already permits PDF.js to load its worker (`'self'` covers `/pdfjs/build/pdf.worker.mjs`) and evaluate its internal function-generated code (`'unsafe-eval'` covers PDF.js's JIT-compiled font/image processors).
6. **Desktop stays on native viewer** — desktop browsers render PDFs natively in iframes reliably, so there's no reason to ship them through PDF.js. Keeping the desktop branch as the raw `pdfUrl` means zero regression risk for the majority of users.

## Deviations from Plan

### Auto-adjusted

**1. [Rule 3 — Environment] `unzip` not installed on server**
- **Found during:** Task 1
- **Issue:** `which unzip` → not found. Server has no `unzip` package installed.
- **Fix:** Used the plan's documented fallback — `python3 -c "import zipfile; zipfile.ZipFile('/tmp/pdfjs.zip').extractall('public/pdfjs/')"`. The plan explicitly called this out as the expected fallback path.
- **Files modified:** none (extraction only)
- **Commit:** baked into Task 1 `84cfb84`

### Flagged (not acted on, per plan guidance)

**2. [Flag only] `.gitignore` excludes `public/pdfjs/web/compressed.tracemonkey-pldi-09.pdf`**
- **Found during:** Task 1, during `git add` dry-run
- **Detail:** The repo's `.gitignore` line 53 is a blanket `*.pdf` rule (to keep accidentally-committed invoice PDFs out of the repo). This caused git to silently ignore the one PDF file that ships inside the PDF.js legacy dist — `web/compressed.tracemonkey-pldi-09.pdf`, a ~1MB sample PDF used when you open `viewer.html` with no `?file=` parameter.
- **Decision:** Per the plan's explicit instruction ("only if clearly unintended for this drop, leave it alone — flag in SUMMARY instead of editing `.gitignore` silently"), I did NOT touch `.gitignore`. The sample PDF is not needed for our use case because we always open the viewer with `?file=/api/invoices/{id}/pdf`, so PDF.js never falls back to the sample.
- **Only other ignored types**: `*.png`, `*.jpg`, `*.jpeg` — but PDF.js ships **all** its toolbar/cursor/annotation icons as SVG, not PNG. Verified with `find public/pdfjs -type f \( -name "*.png" -o -name "*.jpg" \)` returning nothing. So only that single sample PDF is affected.
- **Action for reviewer:** If we ever want a "no file" landing page in the viewer (e.g. for debugging), we'd need to either (a) add a `!public/pdfjs/web/compressed.tracemonkey-pldi-09.pdf` negation to `.gitignore`, or (b) remove the file from `public/pdfjs/` entirely and patch the viewer to not reference it. For now, neither is needed.
- **Files modified:** none

## Known Stubs / Deferred

None. Option D is a complete, self-contained solution: the real PDF renders on mobile via PDF.js canvas, desktop unchanged, print/download unchanged, XML view unchanged. No placeholder UI, no TODO comments, no future-work markers.

## Human Verification Status — Task 3 PENDING

**Status:** Task 3 is a `checkpoint:human-verify` gate that requires the user to start the dev server and manually exercise the modal in desktop + mobile DevTools emulation. **Execution stops here** per the plan's gate instructions; the user must sign off before the plan is considered complete.

### Manual Verification Checklist (from Task 3)

**Pre-check — start dev server:**
- [ ] Run `qldev` (or `cd ~/QLMED/dev && PORT=3001 npm run dev`)
- [ ] Wait for "Ready" log
- [ ] Open `http://localhost:3001` or `http://100.83.11.58:3001`

**Step A — Static asset reachability (curl smoke test):**
- [ ] `curl -I http://localhost:3001/pdfjs/web/viewer.html` → 200 OK, `text/html`
- [ ] `curl -I http://localhost:3001/pdfjs/build/pdf.mjs` → 200 OK, `text/javascript` or `application/javascript`
- [ ] `curl -I http://localhost:3001/pdfjs/build/pdf.worker.mjs` → 200 OK

**Step B — Desktop regression (viewport ≥ 768px):**
- [ ] Open app on desktop width, log in, navigate to fiscal/invoices
- [ ] Open an **issued NF-e** → DANFE renders as real PDF inline via browser native viewer
- [ ] DevTools → Elements: iframe `src` = `/api/invoices/{id}/pdf` (NO `?format=html`, NO `/pdfjs/`)
- [ ] Toggle to XML view → syntax-highlighted XML renders
- [ ] Open a **received NF-e** (HTML-generated DANFE) → renders
- [ ] Open a **CT-e** → DACTE renders
- [ ] Open an **NFS-e** (if available) → renders
- [ ] Click **Imprimir** → new tab at `/api/invoices/{id}/pdf?print=true` shows real PDF
- [ ] Click **Baixar PDF** → new tab at `/api/invoices/{id}/pdf?download=true` downloads real PDF

**Step C — Mobile verification (the fix, viewport < 768px):**
- [ ] DevTools → device toolbar, pick iPhone 12 or Pixel 7
- [ ] Hard-reload (Ctrl+Shift+R), log in, open an issued NF-e
- [ ] DANFE view shows **PDF.js viewer chrome** (toolbar: page nav / zoom / search / download / print / pt-BR localized)
- [ ] PDF renders as canvas pages
- [ ] DevTools → Elements: iframe `src` = `/pdfjs/web/viewer.html?file=%2Fapi%2Finvoices%2F{id}%2Fpdf`
- [ ] DevTools → Network shows: `viewer.html` (200), `viewer.mjs`/`viewer.css` (200), `pdf.mjs` + `pdf.worker.mjs` from `/pdfjs/build/` (200), `/api/invoices/{id}/pdf` (200, `application/pdf`)
- [ ] Scroll inside iframe → pagination/zoom work
- [ ] Repeat for a **CT-e** → DACTE renders via PDF.js
- [ ] Repeat for an **NFS-e** → renders via PDF.js
- [ ] Toggle to XML view → syntax-highlighted XML still renders
- [ ] Click **Imprimir** → new tab at `/api/invoices/{id}/pdf?print=true` (raw PDF, NOT `/pdfjs/`)
- [ ] Click **Baixar PDF** → new tab at `/api/invoices/{id}/pdf?download=true` (raw PDF)
- [ ] Resize viewport across 768px boundary → iframe `src` reacts: desktop → raw, mobile → `/pdfjs/...`

**Step D — Real device check (recommended, via Tailscale):**
- [ ] On actual phone on Tailscale, open `http://100.83.11.58:3001`
- [ ] Log in, open issued NF-e → PDF.js viewer renders real paginated PDF
- [ ] Tap Imprimir / Baixar PDF → native browser handles real PDF

**Step E — Console & Network sanity:**
- [ ] No React hydration warnings related to `isMobile` / `iframeSrc`
- [ ] No CSP violations in DevTools Console
- [ ] No 404s from `/pdfjs/...` in Network tab
- [ ] PDF.js worker loads from same origin (`/pdfjs/build/pdf.worker.mjs`)

### Expected Outcome Matrix

| View       | Desktop                          | Mobile                                                               |
|------------|----------------------------------|----------------------------------------------------------------------|
| iframe src | `/api/invoices/{id}/pdf`         | `/pdfjs/web/viewer.html?file=%2Fapi%2Finvoices%2F{id}%2Fpdf`         |
| Renders as | Browser native PDF viewer        | PDF.js canvas viewer with toolbar                                    |
| Imprimir   | `?print=true` (real PDF)         | `?print=true` (real PDF)                                             |
| Baixar PDF | `?download=true` (real PDF)      | `?download=true` (real PDF)                                          |
| XML view   | Highlighted XML                  | Highlighted XML                                                      |

### Resume Signal

User should type **"approved"** if all steps pass, or describe any issue (e.g. "PDF.js worker 404", "CSP blocks eval", "hydration warning", "mobile still blank", "desktop regression", "Imprimir opens PDF.js instead of raw PDF").

## Self-Check: PASSED

**File existence checks:**
- FOUND: /home/marce/QLMED/dev/public/pdfjs/web/viewer.html
- FOUND: /home/marce/QLMED/dev/public/pdfjs/build/pdf.mjs
- FOUND: /home/marce/QLMED/dev/public/pdfjs/build/pdf.worker.mjs
- FOUND: /home/marce/QLMED/dev/public/pdfjs/LICENSE
- FOUND: /home/marce/QLMED/dev/src/app/api/invoices/[id]/pdf/route.ts (modified)
- FOUND: /home/marce/QLMED/dev/src/components/InvoiceDetailsModal.tsx (modified)
- FOUND: /home/marce/QLMED/dev/.planning/quick/260410-swk-option-d-pdf-js-standalone-viewer-for-mo/260410-swk-SUMMARY.md

**Commit existence checks:**
- FOUND: 84cfb84 (Task 1: PDF.js asset drop)
- FOUND: 17554d9 (Task 2: route revert + mobile iframe switch)

**Static assertions:**
- `format === 'html'` in route.ts → 0 matches OK
- `forceHtml` in route.ts → 0 matches OK
- `format=html` in InvoiceDetailsModal.tsx → 0 matches OK
- `/pdfjs/web/viewer.html?file=` in InvoiceDetailsModal.tsx → 1 match (line 165) OK
- `encodeURIComponent(pdfUrl)` in InvoiceDetailsModal.tsx → 1 match (line 165) OK
- `${pdfUrl}?print=true` in InvoiceDetailsModal.tsx → 1 match (line 169) OK
- `${pdfUrl}?download=true` in InvoiceDetailsModal.tsx → 1 match (line 173) OK
- `matchMedia('(max-width: 767px)')` in InvoiceDetailsModal.tsx → 1 match (line 132) OK
- `npx tsc --noEmit` → no new errors in modified files OK
- `git diff --stat package.json next.config.mjs` → empty OK
