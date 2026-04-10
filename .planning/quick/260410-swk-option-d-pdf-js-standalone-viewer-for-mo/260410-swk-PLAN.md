---
phase: quick-260410-swk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/invoices/[id]/pdf/route.ts
  - src/components/InvoiceDetailsModal.tsx
  - public/pdfjs/**
autonomous: false
requirements:
  - QUICK-260410-swk
must_haves:
  truths:
    - "Desktop (>=768px) DANFE view continues to load the raw PDF URL in an iframe, identical to current behavior"
    - "Mobile (<768px) DANFE view loads /pdfjs/web/viewer.html and renders the PDF via PDF.js canvas"
    - "GET /api/invoices/:id/pdf no longer accepts format=html and always returns PDF/HTML per the pre-s81 branching"
    - "Imprimir button still opens the raw PDF with ?print=true on both desktop and mobile"
    - "Baixar PDF button still opens the raw PDF with ?download=true on both desktop and mobile"
    - "XML view branch of the modal is completely unchanged"
    - "PDF.js static assets are served from public/pdfjs/ under the app origin (same-origin auth cookies flow automatically)"
  artifacts:
    - path: "src/app/api/invoices/[id]/pdf/route.ts"
      provides: "PDF/HTML route reverted to pre-s81 state (no format query param, no forceHtml gating)"
      must_not_contain: "format === 'html'"
    - path: "src/components/InvoiceDetailsModal.tsx"
      provides: "iframeSrc uses /pdfjs/web/viewer.html?file=<encoded pdfUrl> on mobile"
      must_contain: "/pdfjs/web/viewer.html"
    - path: "public/pdfjs/web/viewer.html"
      provides: "Mozilla PDF.js standalone viewer entry point (v4.8.69 legacy dist)"
    - path: "public/pdfjs/build/pdf.mjs"
      provides: "PDF.js core module"
    - path: "public/pdfjs/build/pdf.worker.mjs"
      provides: "PDF.js worker module"
  key_links:
    - from: "src/components/InvoiceDetailsModal.tsx"
      to: "public/pdfjs/web/viewer.html"
      via: "iframe src attribute"
      pattern: "/pdfjs/web/viewer\\.html\\?file="
    - from: "public/pdfjs/web/viewer.html"
      to: "/api/invoices/:id/pdf"
      via: "PDF.js internal fetch of the ?file= parameter (same-origin, cookies attached automatically)"
---

<objective>
Implement Option D for the mobile DANFE viewing problem: drop Mozilla PDF.js v4.8.69 legacy dist as static assets under `public/pdfjs/`, revert the backend `format=html` shortcut added by 260410-s81, and switch the mobile iframe in `InvoiceDetailsModal` to point at `/pdfjs/web/viewer.html?file=<pdfUrl>`.

Purpose: Mobile Chrome/Firefox do not render PDFs inline. 260410-rvi tried a placeholder card (rejected), 260410-s81 tried rendering raw DANFE HTML in the iframe (also suboptimal — users want real PDF pagination/zoom on mobile). Option D gives them the real PDF rendered via PDF.js canvas on mobile while leaving desktop behavior byte-identical. Same-origin serving means auth cookies flow to the PDF route automatically, so no CSP changes or token plumbing are needed.

Output:
- `public/pdfjs/` directory containing the extracted PDF.js legacy dist (viewer.html, build/, web/, locale/, images/, LICENSE)
- `src/app/api/invoices/[id]/pdf/route.ts` reverted to pre-s81 state (removing `format`/`forceHtml` lines 41-52 back to a plain unconditional `getOriginalIssuedPdf` call)
- `src/components/InvoiceDetailsModal.tsx` with an updated `iframeSrc` line that points at the PDF.js viewer on mobile
- Working mobile DANFE view rendered by PDF.js, verified manually in DevTools mobile emulation
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src/app/api/invoices/[id]/pdf/route.ts
@src/components/InvoiceDetailsModal.tsx
@next.config.mjs
@.planning/quick/260410-rvi-fix-mobile-danfe-viewing-in-invoicedetai/260410-rvi-SUMMARY.md
@.planning/quick/260410-s81-implement-option-b-mobile-danfe-via-html/260410-s81-SUMMARY.md

<prior_state>
Current production commit is `d015d49`. This plan is a two-step pivot off the 260410-s81 approach.

`src/app/api/invoices/[id]/pdf/route.ts` (current state — added by 260410-s81 commit `d9b555e`):
- Line 38: `const url = new URL(req.url);`
- Line 39: `const autoPrint = url.searchParams.get('print') === 'true';`
- Line 40: `const download = url.searchParams.get('download') === 'true';`
- Line 41: `const format = url.searchParams.get('format');`           <-- added by s81, remove
- Line 42: `const forceHtml = format === 'html' && !!invoice.xmlContent;` <-- added by s81, remove
- Lines 44-52: `const originalIssuedPdf = forceHtml ? null : await getOriginalIssuedPdf({...});` <-- ternary added by s81, revert to plain await

Pre-s81 state (target after revert):
```ts
const url = new URL(req.url);
const autoPrint = url.searchParams.get('print') === 'true';
const download = url.searchParams.get('download') === 'true';

const originalIssuedPdf = await getOriginalIssuedPdf({
  companyId: invoice.companyId,
  type: invoice.type,
  direction: invoice.direction,
  number: invoice.number,
  issueDate: invoice.issueDate,
});
```

Everything else in the route (imports, error handling, HTML generation branches, Puppeteer download path, response headers) stays exactly as-is.

`src/components/InvoiceDetailsModal.tsx` (current state — line 164 added by s81 commit `cb65357`):
- Line 128: `const [isMobile, setIsMobile] = useState(false);`   <-- KEEP (from 260410-rvi)
- Lines 130-137: `useEffect` with `matchMedia('(max-width: 767px)')` listener <-- KEEP (from 260410-rvi)
- Line 163: `const pdfUrl = ${'`'}/api/invoices/${'${'}invoiceId${'}'}/pdf${'`'};`
- Line 164: `const iframeSrc = isMobile ? ${'`'}${'${'}pdfUrl${'}'}?format=html${'`'} : pdfUrl;` <-- CHANGE this line
- Line 167: `window.open(${'`'}${'${'}pdfUrl${'}'}?print=true${'`'}, '_blank');` <-- KEEP
- Line 171: `window.open(${'`'}${'${'}pdfUrl${'}'}?download=true${'`'}, '_blank');` <-- KEEP
- Line 366: `<iframe src={iframeSrc} ... />` <-- KEEP (uses the updated iframeSrc)
</prior_state>

<interfaces>
<!-- Key contracts the executor needs. Extracted from current codebase. -->

From `src/components/InvoiceDetailsModal.tsx`:
```tsx
// Current mobile detection — DO NOT TOUCH
const [isMobile, setIsMobile] = useState(false);

useEffect(() => {
  if (typeof window === 'undefined') return;
  const mq = window.matchMedia('(max-width: 767px)');
  const update = () => setIsMobile(mq.matches);
  update();
  mq.addEventListener('change', update);
  return () => mq.removeEventListener('change', update);
}, []);

// Line 163-164 — pdfUrl stays, iframeSrc changes
const pdfUrl = `/api/invoices/${invoiceId}/pdf`;
const iframeSrc = isMobile ? `${pdfUrl}?format=html` : pdfUrl;  // <-- replace this line

// Line 166-172 — KEEP untouched
const handlePrint = () => {
  window.open(`${pdfUrl}?print=true`, '_blank');
};
const handleDownloadPdf = () => {
  window.open(`${pdfUrl}?download=true`, '_blank');
};
```

From `next.config.mjs` (CSP — DO NOT MODIFY):
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
worker-src 'self';
connect-src 'self';
```
`'self'` covers `/pdfjs/*`. `'unsafe-eval'` + `worker-src 'self'` cover PDF.js worker initialization. No header changes needed.

From `src/app/api/invoices/[id]/pdf/route.ts` lines 38-52 (current, pre-revert):
```ts
const url = new URL(req.url);
const autoPrint = url.searchParams.get('print') === 'true';
const download = url.searchParams.get('download') === 'true';
const format = url.searchParams.get('format');
const forceHtml = format === 'html' && !!invoice.xmlContent;

const originalIssuedPdf = forceHtml
  ? null
  : await getOriginalIssuedPdf({
      companyId: invoice.companyId,
      type: invoice.type,
      direction: invoice.direction,
      number: invoice.number,
      issueDate: invoice.issueDate,
    });
```

Target (post-revert):
```ts
const url = new URL(req.url);
const autoPrint = url.searchParams.get('print') === 'true';
const download = url.searchParams.get('download') === 'true';

const originalIssuedPdf = await getOriginalIssuedPdf({
  companyId: invoice.companyId,
  type: invoice.type,
  direction: invoice.direction,
  number: invoice.number,
  issueDate: invoice.issueDate,
});
```
</interfaces>

<asset_drop>
Mozilla PDF.js release to fetch:
- Version: v4.8.69
- URL: https://github.com/mozilla/pdf.js/releases/download/v4.8.69/pdfjs-4.8.69-legacy-dist.zip
- Target directory: `public/pdfjs/`
- After extraction, the zip contains `build/`, `web/`, `LICENSE` at the top level — these should land directly under `public/pdfjs/` (NOT nested under `public/pdfjs/pdfjs-4.8.69-legacy-dist/`).

Extraction procedure (run from `/home/marce/QLMED/dev`):
```bash
mkdir -p public/pdfjs
curl -fsSL -o /tmp/pdfjs.zip https://github.com/mozilla/pdf.js/releases/download/v4.8.69/pdfjs-4.8.69-legacy-dist.zip
unzip -q -o /tmp/pdfjs.zip -d public/pdfjs/
rm /tmp/pdfjs.zip
# Verify expected files exist
test -f public/pdfjs/web/viewer.html && echo "viewer.html OK"
test -f public/pdfjs/build/pdf.mjs && echo "pdf.mjs OK"
test -f public/pdfjs/build/pdf.worker.mjs && echo "pdf.worker.mjs OK"
```

If `unzip` is not installed, the executor should try `apt list --installed 2>/dev/null | grep -i unzip` and, if missing, fall back to `python3 -c "import zipfile; zipfile.ZipFile('/tmp/pdfjs.zip').extractall('public/pdfjs/')"`.

The extracted zip SHOULD produce `public/pdfjs/web/viewer.html` directly. If instead it produces `public/pdfjs/pdfjs-4.8.69-legacy-dist/web/viewer.html`, the executor must move the contents up one level:
```bash
if [ -d public/pdfjs/pdfjs-4.8.69-legacy-dist ]; then
  mv public/pdfjs/pdfjs-4.8.69-legacy-dist/* public/pdfjs/
  rmdir public/pdfjs/pdfjs-4.8.69-legacy-dist
fi
```
</asset_drop>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Drop PDF.js v4.8.69 legacy dist into public/pdfjs/</name>
  <files>public/pdfjs/ (new directory, ~200 files from zip extraction)</files>
  <action>
    Fetch Mozilla PDF.js v4.8.69 legacy dist and extract it into `public/pdfjs/` so that `public/pdfjs/web/viewer.html` and `public/pdfjs/build/pdf.mjs` exist as direct paths.

    Steps (from repo root `/home/marce/QLMED/dev`):
    1. `mkdir -p public/pdfjs`
    2. `curl -fsSL -o /tmp/pdfjs.zip https://github.com/mozilla/pdf.js/releases/download/v4.8.69/pdfjs-4.8.69-legacy-dist.zip`
    3. `unzip -q -o /tmp/pdfjs.zip -d public/pdfjs/` (if `unzip` missing, fall back to `python3 -c "import zipfile; zipfile.ZipFile('/tmp/pdfjs.zip').extractall('public/pdfjs/')"`)
    4. If the zip extracted into a nested `public/pdfjs/pdfjs-4.8.69-legacy-dist/` subdir, flatten it:
       `mv public/pdfjs/pdfjs-4.8.69-legacy-dist/* public/pdfjs/ && rmdir public/pdfjs/pdfjs-4.8.69-legacy-dist`
    5. `rm /tmp/pdfjs.zip`

    Notes:
    - Do NOT add anything to `package.json` — PDF.js here is a static asset drop, not an npm dependency.
    - Do NOT touch `next.config.mjs` — current CSP (`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self'`) already covers the viewer.
    - Do not attempt to run `npm run build`.
    - Do not run the dev server.
    - Keep the extracted tree intact (including `web/locale/`, `web/images/`, `LICENSE`) — PDF.js relies on relative paths from `viewer.html`.
    - If `.gitignore` has a rule excluding `public/pdfjs/` or similar, check and (only if clearly unintended for this drop) leave it alone — flag it in the SUMMARY instead of editing `.gitignore` silently.
  </action>
  <verify>
    <automated>test -f public/pdfjs/web/viewer.html && test -f public/pdfjs/build/pdf.mjs && test -f public/pdfjs/build/pdf.worker.mjs && test -f public/pdfjs/LICENSE && echo OK</automated>
  </verify>
  <done>
    - `public/pdfjs/web/viewer.html` exists
    - `public/pdfjs/build/pdf.mjs` exists
    - `public/pdfjs/build/pdf.worker.mjs` exists
    - `public/pdfjs/LICENSE` exists
    - No nested `pdfjs-4.8.69-legacy-dist/` directory under `public/pdfjs/`
    - `/tmp/pdfjs.zip` cleaned up
    - No modifications to `package.json` or `next.config.mjs`
  </done>
</task>

<task type="auto">
  <name>Task 2: Revert route.ts format=html shortcut and switch mobile iframe to PDF.js viewer</name>
  <files>src/app/api/invoices/[id]/pdf/route.ts, src/components/InvoiceDetailsModal.tsx</files>
  <action>
    Two surgical edits across two files. No other changes, no reformatting, no import reordering.

    **Edit A — `src/app/api/invoices/[id]/pdf/route.ts` (revert 260410-s81 changes)**

    Replace the block at lines 38-52 (current):
    ```ts
    const url = new URL(req.url);
    const autoPrint = url.searchParams.get('print') === 'true';
    const download = url.searchParams.get('download') === 'true';
    const format = url.searchParams.get('format');
    const forceHtml = format === 'html' && !!invoice.xmlContent;

    const originalIssuedPdf = forceHtml
      ? null
      : await getOriginalIssuedPdf({
          companyId: invoice.companyId,
          type: invoice.type,
          direction: invoice.direction,
          number: invoice.number,
          issueDate: invoice.issueDate,
        });
    ```

    With the pre-s81 version:
    ```ts
    const url = new URL(req.url);
    const autoPrint = url.searchParams.get('print') === 'true';
    const download = url.searchParams.get('download') === 'true';

    const originalIssuedPdf = await getOriginalIssuedPdf({
      companyId: invoice.companyId,
      type: invoice.type,
      direction: invoice.direction,
      number: invoice.number,
      issueDate: invoice.issueDate,
    });
    ```

    Do NOT touch anything else in `route.ts` — the Puppeteer download branch, the HTML fallback branches (NFE/CTE/NFSE), the logger, error handling, and response headers all stay untouched.

    **Edit B — `src/components/InvoiceDetailsModal.tsx` (point mobile iframe at PDF.js viewer)**

    Replace line 164 (current):
    ```tsx
    const iframeSrc = isMobile ? `${pdfUrl}?format=html` : pdfUrl;
    ```

    With:
    ```tsx
    const iframeSrc = isMobile
      ? `/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`
      : pdfUrl;
    ```

    Do NOT touch:
    - The `isMobile` state declaration (line 128) — stays
    - The `useEffect` with `matchMedia('(max-width: 767px)')` (lines 130-137) — stays
    - The `pdfUrl` constant (line 163) — stays
    - `handlePrint` (line 166-168) — stays, continues to use `${pdfUrl}?print=true`
    - `handleDownloadPdf` (line 170-172) — stays, continues to use `${pdfUrl}?download=true`
    - `handleDownloadXml` — stays
    - The entire XML view branch — stays
    - The `<iframe src={iframeSrc} ... />` element at line ~366 — stays (it will now consume the new `iframeSrc` automatically)
    - The DOC_THEME map, header buttons, access key bar, footer — all stay

    After both edits, run a quick grep sanity check:
    ```bash
    grep -n "format === 'html'" src/app/api/invoices/[id]/pdf/route.ts   # must return 0 lines
    grep -n "forceHtml" src/app/api/invoices/[id]/pdf/route.ts           # must return 0 lines
    grep -n "format=html" src/components/InvoiceDetailsModal.tsx         # must return 0 lines
    grep -n "/pdfjs/web/viewer.html" src/components/InvoiceDetailsModal.tsx  # must return 1 line
    grep -n "encodeURIComponent(pdfUrl)" src/components/InvoiceDetailsModal.tsx  # must return 1 line
    grep -n "?print=true" src/components/InvoiceDetailsModal.tsx         # must return 1 line
    grep -n "?download=true" src/components/InvoiceDetailsModal.tsx      # must return 1 line
    ```

    Run TypeScript check on both modified files (fast, skips full build):
    ```bash
    export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22 >/dev/null
    npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(route\.ts|InvoiceDetailsModal\.tsx)" || echo "no errors in modified files"
    ```

    Do NOT run `npm run build`. Do NOT run `npm run dev`.
  </action>
  <verify>
    <automated>grep -q "format === 'html'" src/app/api/invoices/\[id\]/pdf/route.ts && exit 1; grep -q "forceHtml" src/app/api/invoices/\[id\]/pdf/route.ts && exit 1; grep -q "format=html" src/components/InvoiceDetailsModal.tsx && exit 1; grep -q "/pdfjs/web/viewer.html?file=" src/components/InvoiceDetailsModal.tsx && grep -q "encodeURIComponent(pdfUrl)" src/components/InvoiceDetailsModal.tsx && grep -q "pdfUrl}?print=true" src/components/InvoiceDetailsModal.tsx && grep -q "pdfUrl}?download=true" src/components/InvoiceDetailsModal.tsx && grep -q "const \[isMobile, setIsMobile\] = useState(false)" src/components/InvoiceDetailsModal.tsx && echo OK</automated>
  </verify>
  <done>
    - `route.ts` no longer contains `format === 'html'` or `forceHtml`
    - `route.ts` has a plain unconditional `const originalIssuedPdf = await getOriginalIssuedPdf({...})`
    - `InvoiceDetailsModal.tsx` `iframeSrc` uses `/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfUrl)}` when mobile, `pdfUrl` when desktop
    - `isMobile` state + `matchMedia` effect preserved unchanged
    - `handlePrint` still uses `${pdfUrl}?print=true`
    - `handleDownloadPdf` still uses `${pdfUrl}?download=true`
    - `handleDownloadXml`, XML view branch, DOC_THEME map, header, footer all unchanged
    - `npx tsc --noEmit` reports no new errors in `route.ts` or `InvoiceDetailsModal.tsx`
    - No changes to `package.json`, `next.config.mjs`, or any other file
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human verification — PDF.js mobile viewer, desktop regression, print/download</name>
  <what-built>
    - `public/pdfjs/` populated with Mozilla PDF.js v4.8.69 legacy dist
    - `src/app/api/invoices/[id]/pdf/route.ts` reverted to pre-s81 behavior (no `format=html` shortcut)
    - `src/components/InvoiceDetailsModal.tsx` mobile iframe now points at `/pdfjs/web/viewer.html?file=<pdfUrl>`
    - Desktop iframe unchanged
  </what-built>
  <how-to-verify>
    **Start dev server:**
    ```bash
    qldev
    # equivalent to: cd ~/QLMED/dev && export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22 && PORT=3001 npm run dev
    ```

    Wait for "Ready" log then open `http://localhost:3001` (or `http://100.83.11.58:3001` via Tailscale).

    **Step A — Static asset reachability (quick smoke test from curl, no browser yet):**
    1. `curl -I http://localhost:3001/pdfjs/web/viewer.html` → expect `200 OK`, `content-type: text/html`
    2. `curl -I http://localhost:3001/pdfjs/build/pdf.mjs` → expect `200 OK`, `content-type: text/javascript` or `application/javascript`
    3. `curl -I http://localhost:3001/pdfjs/build/pdf.worker.mjs` → expect `200 OK`

    **Step B — Desktop regression (behavior MUST be unchanged from pre-rvi state):**
    1. Open the app in a desktop-width browser window (>= 768px viewport). Log in.
    2. Navigate to the fiscal/invoices panel.
    3. Click any **issued NF-e** → `InvoiceDetailsModal` opens.
    4. Confirm the DANFE view renders the original PDF inline via the browser's native PDF viewer (exactly as in production today). The iframe `src` in DevTools → Elements should equal `/api/invoices/{id}/pdf` with NO `?format=html` and NO `/pdfjs/` prefix.
    5. Toggle to XML view → syntax-highlighted XML must render.
    6. Open a **received NF-e** (HTML-generated DANFE), a **CT-e**, and an **NFS-e** (if available) — each should render its respective document in the iframe.
    7. Click **Imprimir** → new tab opens at `/api/invoices/{id}/pdf?print=true` and shows the real PDF ready to print.
    8. Click **Baixar PDF** → new tab opens at `/api/invoices/{id}/pdf?download=true` and a real PDF downloads.

    **Step C — Mobile verification (the fix):**
    1. Open Chrome or Firefox DevTools → device toolbar (Ctrl+Shift+M). Pick a mobile preset (iPhone 12, Pixel 7 — viewport < 768px).
    2. Hard-reload the page (Ctrl+Shift+R).
    3. Log in and open an **issued NF-e** in the fiscal panel.
    4. Confirm the DANFE view shows the **PDF.js viewer chrome** (top toolbar with page nav, zoom, search, download, print icons — PDF.js default UI) and the PDF rendered as canvas pages.
    5. Inspect the iframe element in DevTools → Elements. Its `src` attribute MUST be `/pdfjs/web/viewer.html?file=%2Fapi%2Finvoices%2F{id}%2Fpdf` (URL-encoded).
    6. Check DevTools → Network tab. You should see requests for:
       - `viewer.html` (200, text/html)
       - `viewer.mjs`, `viewer.css` (200)
       - `pdf.mjs` and `pdf.worker.mjs` from `/pdfjs/build/` (200)
       - `/api/invoices/{id}/pdf` (200, `content-type: application/pdf`) — triggered by PDF.js internal fetch
    7. Scroll inside the iframe — pagination works, zoom works, PDF.js toolbar functional.
    8. Repeat for a **CT-e** (DACTE) and an **NFS-e** — both should render as PDFs via PDF.js in the same viewer.
    9. Toggle to XML view in the modal header — syntax-highlighted XML must still render (unchanged).
    10. Click the modal's **Imprimir** button → new tab opens at `/api/invoices/{id}/pdf?print=true` (the real PDF, not `/pdfjs/...`).
    11. Click the modal's **Baixar PDF** button → new tab opens at `/api/invoices/{id}/pdf?download=true` (the real PDF).
    12. Resize DevTools viewport from mobile to desktop and back across the 768px boundary → the iframe `src` must react: desktop = raw `pdfUrl`, mobile = `/pdfjs/web/viewer.html?file=...`.

    **Step D — Real device check (recommended, only if reachable):**
    1. On an actual phone on the Tailscale network, open `http://100.83.11.58:3001`.
    2. Log in, open an issued NF-e.
    3. Confirm the PDF.js viewer renders the DANFE as a real paginated PDF with zoom/scroll/toolbar — NOT a placeholder, NOT raw HTML, NOT a blank iframe.
    4. Tap Imprimir / Baixar PDF buttons → native browser handles the real PDF.

    **Step E — Console & Network sanity:**
    - No React hydration warnings related to `isMobile` / `iframeSrc` on initial load.
    - No CSP violations in DevTools → Console (if any appear, copy them — CSP should already cover this).
    - No 404s from `/pdfjs/...` in the Network tab.
    - PDF.js worker loads from same origin (`/pdfjs/build/pdf.worker.mjs`) — check the Network tab.

    **Expected outcome summary:**
    | View | Desktop | Mobile |
    |------|---------|--------|
    | iframe src | `/api/invoices/{id}/pdf` | `/pdfjs/web/viewer.html?file=%2Fapi%2Finvoices%2F{id}%2Fpdf` |
    | Renders as | Browser native PDF viewer | PDF.js canvas viewer with toolbar |
    | Imprimir | `?print=true` (real PDF) | `?print=true` (real PDF) |
    | Baixar PDF | `?download=true` (real PDF) | `?download=true` (real PDF) |
    | XML view | Highlighted XML | Highlighted XML |
  </how-to-verify>
  <resume-signal>
    Type **"approved"** if all steps pass, or describe any issue observed (e.g. "PDF.js worker 404", "CSP blocks eval", "hydration warning on InvoiceDetailsModal", "mobile still blank", "desktop regression in iframe", "Imprimir opens PDF.js instead of raw PDF").
  </resume-signal>
</task>

</tasks>

<verification>
Overall must-haves to re-check before declaring complete (after Task 3 approval):

- `test -f public/pdfjs/web/viewer.html && test -f public/pdfjs/build/pdf.mjs && test -f public/pdfjs/build/pdf.worker.mjs`
- `grep -c "format === 'html'" src/app/api/invoices/\[id\]/pdf/route.ts` → 0
- `grep -c "forceHtml" src/app/api/invoices/\[id\]/pdf/route.ts` → 0
- `grep -c "/pdfjs/web/viewer.html?file=" src/components/InvoiceDetailsModal.tsx` → 1
- `grep -c "encodeURIComponent(pdfUrl)" src/components/InvoiceDetailsModal.tsx` → 1
- `grep -c "?print=true" src/components/InvoiceDetailsModal.tsx` → 1
- `grep -c "?download=true" src/components/InvoiceDetailsModal.tsx` → 1
- `grep -c "matchMedia('(max-width: 767px)')" src/components/InvoiceDetailsModal.tsx` → 1
- `git diff --stat package.json next.config.mjs` → empty (untouched)
- `npx tsc --noEmit -p tsconfig.json` → no new errors in the two modified files
- Human verification in Task 3 signed off as "approved"
</verification>

<success_criteria>
- `public/pdfjs/` holds the full Mozilla PDF.js v4.8.69 legacy dist tree
- Backend route is byte-identical to its pre-260410-s81 state (diff against `d015d49` parent should reverse exactly commit `d9b555e` for this file)
- `InvoiceDetailsModal.tsx` keeps the 260410-rvi `isMobile` machinery and only changes the single `iframeSrc` line
- Desktop users observe zero behavior change vs production today
- Mobile users see the real PDF rendered via PDF.js canvas viewer with working pagination/zoom/toolbar
- Imprimir and Baixar PDF buttons continue to hit the raw PDF URL on both platforms
- XML view branch is untouched
- `package.json` and `next.config.mjs` are untouched
- No CSP errors, no hydration warnings, no `/pdfjs/*` 404s
- Human-verify checkpoint (Task 3) approved
</success_criteria>

<output>
After completion, create `.planning/quick/260410-swk-option-d-pdf-js-standalone-viewer-for-mo/260410-swk-SUMMARY.md` documenting:
- What was built (asset drop + route revert + modal iframe switch)
- PDF.js version and source URL
- Files modified with commit hashes
- Revert diff vs 260410-s81 commit `d9b555e` (route.ts) and `cb65357` (InvoiceDetailsModal.tsx)
- Verification evidence (grep results, tsc output, curl smoke test of `/pdfjs/*`)
- Decisions made (v4.8.69 legacy dist for mobile browser compat, `encodeURIComponent` on `pdfUrl`, no package.json dep, no CSP changes)
- Deviations from plan (if any)
- Known stubs / deferred (none expected)
- Human verification status from Task 3
</output>
