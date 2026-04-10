---
phase: quick-260410-rvi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/InvoiceDetailsModal.tsx
autonomous: false
requirements:
  - QUICK-260410-rvi
must_haves:
  truths:
    - "On mobile devices (viewport < 768px), the DANFE view does NOT render an iframe for issued NF-e PDFs"
    - "On mobile devices, the DANFE view shows a placeholder card with an icon, explanatory text in Portuguese, and an 'Abrir DANFE' button"
    - "Clicking 'Abrir DANFE' on mobile opens the existing pdfUrl (/api/invoices/{invoiceId}/pdf) in a new browser tab"
    - "On desktop devices (viewport >= 768px), the DANFE view continues to render the iframe exactly as before (no visual or behavioral change)"
    - "Initial server-side render defaults to desktop (iframe) to avoid hydration mismatch; mobile state is only applied after client mount"
    - "The XML view is completely unaffected by this change (still shows syntax-highlighted XML on all devices)"
  artifacts:
    - path: "src/components/InvoiceDetailsModal.tsx"
      provides: "Conditional DANFE rendering: iframe on desktop, placeholder card with 'Abrir DANFE' button on mobile"
      contains: "window.matchMedia"
  key_links:
    - from: "src/components/InvoiceDetailsModal.tsx (danfe view branch, ~line 352)"
      to: "window.open(pdfUrl, '_blank')"
      via: "Abrir DANFE button onClick handler, gated by isMobile state"
      pattern: "window\\.open\\(pdfUrl"
    - from: "src/components/InvoiceDetailsModal.tsx (mobile detection)"
      to: "isMobile state"
      via: "useEffect + window.matchMedia('(max-width: 767px)') listener"
      pattern: "matchMedia\\('\\(max-width: 767px\\)'\\)"
---

<objective>
Fix broken DANFE viewing on mobile browsers (Chrome Android, Safari iOS) where `<iframe src="...pdf">` renders blank or forces download. On mobile, replace the iframe with a placeholder card containing an "Abrir DANFE" button that opens the same pdfUrl in a new tab. Desktop iframe behavior must remain unchanged.

Purpose: Mobile users currently cannot view DANFE for issued NF-e at all — the iframe renders nothing because mobile browsers don't support inline PDF rendering. This unblocks mobile access without regressing desktop.

Output: Modified `src/components/InvoiceDetailsModal.tsx` with inline mobile detection (useState + useEffect + window.matchMedia) and conditional rendering in the danfe view section (~line 352).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@src/components/InvoiceDetailsModal.tsx

<interfaces>
<!-- Key context the executor needs — already inside InvoiceDetailsModal.tsx -->
<!-- Executor should use these directly; no codebase exploration needed. -->

Component signature (line 122):
```typescript
export default function InvoiceDetailsModal({ isOpen, onClose, invoiceId }: InvoiceDetailsModalProps)
```

Existing state hooks already imported from 'react' (line 3):
```typescript
import { useState, useEffect, useMemo } from 'react';
```
No new imports required — useState and useEffect are already available.

pdfUrl construction (line 153):
```typescript
const pdfUrl = `/api/invoices/${invoiceId}/pdf`;
```

Theme object (line 152, reused in the placeholder card for consistency):
```typescript
const theme = (meta?.type ? DOC_THEME[meta.type] : null) || DEFAULT_THEME;
// theme.icon, theme.label, theme.gradient, theme.ring, theme.text, theme.pdfLabel
```

Current danfe view (lines 352-359) — the ONLY block to modify:
```tsx
{view === 'danfe' ? (
  <div className="w-full h-full bg-slate-200 dark:bg-slate-900">
    <iframe
      src={pdfUrl}
      className="w-full h-full border-0"
      title="Preview do documento"
    />
  </div>
) : (
  // XML view — LEAVE UNCHANGED
)}
```

Existing window.open pattern already used in the file (lines 156, 160) — reuse this exact pattern for "Abrir DANFE":
```typescript
window.open(`${pdfUrl}?download=true`, '_blank');
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add mobile detection state and conditional DANFE rendering</name>
  <files>src/components/InvoiceDetailsModal.tsx</files>
  <action>
Make two surgical edits to `src/components/InvoiceDetailsModal.tsx`. No new files, no new imports, no changes to props or exports.

**Edit 1 — Add isMobile state and detection effect.**

Inside the `InvoiceDetailsModal` function component, add a new state and effect alongside the existing hooks (after the existing `useState` declarations around line 127, before the existing `useEffect` at line 129):

```typescript
const [isMobile, setIsMobile] = useState(false);

useEffect(() => {
  if (typeof window === 'undefined') return;
  const mq = window.matchMedia('(max-width: 767px)');
  const update = () => setIsMobile(mq.matches);
  update();
  mq.addEventListener('change', update);
  return () => mq.removeEventListener('change', update);
}, []);
```

Rationale for design choices:
- `useState(false)` default ensures SSR renders desktop iframe (avoids hydration mismatch — server has no `window`).
- `useEffect` with empty deps runs once after mount, then updates to the real mobile state.
- Breakpoint `max-width: 767px` matches Tailwind's `md:` breakpoint boundary (md = 768px and up). Mobile is strictly below 768px. Use 767px (not 768px) because matchMedia max-width is inclusive.
- `addEventListener('change', ...)` is the modern API (replaces deprecated `addListener`). Supported in all browsers that Next.js 15 targets.
- Cleanup removes the listener on unmount to avoid leaks.

**Edit 2 — Replace the danfe iframe block with conditional rendering.**

Locate the existing block at approximately lines 352-359 (inside the `{/* Content */}` div, the `view === 'danfe' ?` branch):

```tsx
{view === 'danfe' ? (
  <div className="w-full h-full bg-slate-200 dark:bg-slate-900">
    <iframe
      src={pdfUrl}
      className="w-full h-full border-0"
      title="Preview do documento"
    />
  </div>
) : (
```

Replace ONLY the inner `<div className="w-full h-full bg-slate-200 ...">...</div>` (the iframe wrapper) with a conditional that renders the iframe on desktop and a placeholder card on mobile:

```tsx
{view === 'danfe' ? (
  isMobile ? (
    <div className="w-full h-full bg-slate-200 dark:bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-4 p-6 rounded-2xl bg-white dark:bg-card-dark ring-1 ring-slate-200 dark:ring-slate-700 shadow-lg">
        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center ring-1 ${theme.ring}`}>
          <span className={`material-symbols-outlined text-[32px] ${theme.text}`}>picture_as_pdf</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[15px] font-bold text-slate-900 dark:text-white">
            Visualização indisponível
          </h4>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Seu navegador não exibe o {theme.pdfLabel} dentro do aplicativo. Toque no botão abaixo para abrir em uma nova aba.
          </p>
        </div>
        <button
          onClick={() => window.open(pdfUrl, '_blank')}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white font-bold text-[13px] shadow-sm shadow-primary/25 hover:shadow-md hover:shadow-primary/30 active:opacity-90 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
          Abrir {theme.pdfLabel}
        </button>
      </div>
    </div>
  ) : (
    <div className="w-full h-full bg-slate-200 dark:bg-slate-900">
      <iframe
        src={pdfUrl}
        className="w-full h-full border-0"
        title="Preview do documento"
      />
    </div>
  )
) : (
```

Design notes:
- Portuguese UI text per CLAUDE.md convention (pt-BR).
- Uses Material Symbols Outlined (`picture_as_pdf`, `open_in_new`) per CLAUDE.md convention.
- Reuses `DOC_THEME` values already computed as `theme` (line 152) so CT-e shows "Abrir DACTE", NFS-e shows "Abrir PDF", NF-e shows "Abrir DANFE" — matching the header's `pdfLabel`.
- Button uses the exact same gradient/shadow styling as the "Imprimir" button (lines 310-316) for visual consistency with existing UI.
- Card uses `bg-white dark:bg-card-dark` to match other card surfaces in the file (e.g., mobile footer at line 417).
- `window.open(pdfUrl, '_blank')` matches the existing pattern at lines 156/160.
- No XML view changes. No header changes. No prop changes.

**DO NOT:**
- Do NOT add a new custom hook file (user asked: no new files).
- Do NOT use a user-agent string check (matchMedia viewport-width is the stated approach and is more reliable).
- Do NOT change the default `isMobile` to `true` (would break SSR hydration for desktop users).
- Do NOT modify the XML branch or any other part of the component.
- Do NOT add any new imports (useState, useEffect already imported from 'react' on line 3).
  </action>
  <verify>
    <automated>cd /home/marce/QLMED/dev &amp;&amp; export NVM_DIR="$HOME/.nvm" &amp;&amp; . "$NVM_DIR/nvm.sh" &amp;&amp; nvm use 22 &gt;/dev/null &amp;&amp; npx tsc --noEmit -p tsconfig.json 2&gt;&amp;1 | grep -i "InvoiceDetailsModal" || echo "OK: no type errors in InvoiceDetailsModal"</automated>
  </verify>
  <done>
- `src/components/InvoiceDetailsModal.tsx` contains `const [isMobile, setIsMobile] = useState(false)`.
- File contains `window.matchMedia('(max-width: 767px)')`.
- File contains the string `Abrir` followed by a theme label reference (e.g., `Abrir {theme.pdfLabel}`).
- File contains `window.open(pdfUrl, '_blank')` inside the danfe view branch.
- `npx tsc --noEmit` produces no type errors for this file.
- No changes to `InvoiceDetailsModalProps` interface, component export, or XML view.
- No new imports added (still only `useState, useEffect, useMemo` from 'react', plus the existing `toast` and `useModalBackButton`).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify mobile and desktop DANFE rendering</name>
  <what-built>
Conditional DANFE rendering in `InvoiceDetailsModal.tsx`:
- Desktop (≥768px): iframe with PDF preview (unchanged behavior)
- Mobile (&lt;768px): placeholder card with icon, Portuguese text, and "Abrir DANFE/DACTE/PDF" button that opens pdfUrl in a new tab
- Mobile detection via `window.matchMedia('(max-width: 767px)')` with SSR-safe default
  </what-built>
  <how-to-verify>
Start the dev server if it isn't running:
```bash
qldev
# or: cd ~/QLMED/dev && export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22 && PORT=3001 npm run dev
```

**Desktop verification (regression check — behavior must NOT change):**
1. Open `http://localhost:3001` (or `http://100.83.11.58:3001` from another machine on Tailscale) in a desktop browser at full width.
2. Log in and navigate to the fiscal/invoices panel.
3. Click any **issued NF-e** to open `InvoiceDetailsModal`.
4. Confirm the DANFE view shows the **iframe with the PDF rendered inline** exactly as before.
5. Confirm the XML toggle still works and shows syntax-highlighted XML.
6. Also open a **received NF-e** (DANFE returns text/html) — iframe must still render the HTML preview.
7. Repeat the desktop check for a **CT-e** and **NFS-e** if available.

**Mobile verification (the fix):**
1. In Chrome/Firefox/Edge DevTools, open the device toolbar (Ctrl+Shift+M) and select a mobile preset (e.g., iPhone 12, Pixel 7) — viewport must be &lt;768px wide.
2. Reload the page (the matchMedia listener updates on viewport changes, but a reload is cleanest).
3. Open an **issued NF-e** in `InvoiceDetailsModal`.
4. Confirm the DANFE view shows:
   - A centered card (NOT an iframe, NOT a blank area).
   - A colored icon badge (picture_as_pdf) matching the doc type theme (primary for NF-e, teal for CT-e, violet for NFS-e).
   - The heading "Visualização indisponível".
   - Portuguese explanatory text mentioning the document label (DANFE/DACTE/PDF).
   - A primary gradient button labeled "Abrir DANFE" (or "Abrir DACTE" / "Abrir PDF" depending on type).
5. Tap the "Abrir DANFE" button → a new tab/window must open loading `/api/invoices/{id}/pdf`.
6. Switch to the XML view in the header toggle → XML view must still work normally.
7. Resize the DevTools viewport across the 768px boundary (drag wider and narrower) — the view should switch between iframe and placeholder card reactively (matchMedia listener).

**Real device check (recommended):**
Use Tailscale to load `http://100.83.11.58:3001` from an actual phone (Chrome Android or Safari iOS). Open an issued NF-e and confirm:
- Placeholder card appears (not a blank iframe or forced download).
- Tapping "Abrir DANFE" opens the PDF in the mobile browser's native PDF viewer / new tab.

**Expected outcome:** Desktop unchanged, mobile shows actionable placeholder, no hydration warnings in the browser console.
  </how-to-verify>
  <resume-signal>Type "approved" or describe any issues observed (e.g., hydration warning, wrong breakpoint, button styling off, theme label incorrect).</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors in `InvoiceDetailsModal.tsx`
- `npm run lint` passes (no new ESLint warnings introduced in this file)
- Desktop browser: iframe renders DANFE PDF inline (unchanged)
- Mobile viewport (&lt;768px): placeholder card renders with "Abrir DANFE" button
- Clicking "Abrir DANFE" on mobile opens `/api/invoices/{id}/pdf` in a new tab
- No React hydration warnings in browser console on either viewport
- XML view is unchanged on all viewports
</verification>

<success_criteria>
- Mobile users can access issued NF-e DANFE PDFs (previously blocked by blank iframe)
- Desktop behavior is byte-for-byte equivalent to previous behavior
- Change is confined to a single file with no new files, no new imports, no prop changes
- Theme-aware label ("Abrir DANFE" / "Abrir DACTE" / "Abrir PDF") matches existing `theme.pdfLabel` usage in the header
- Human verification approved for both desktop and mobile paths
</success_criteria>

<output>
After completion, create `.planning/quick/260410-rvi-fix-mobile-danfe-viewing-in-invoicedetai/260410-rvi-SUMMARY.md`
</output>
