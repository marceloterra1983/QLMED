# Wave 4 Architectural Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Wave 4 architectural enhancements: unify OneDrive folder ingestion into a Deep Module, invert dependencies and generalize types in `graph-mail-client`, and disambiguate currency formatting in `money.ts`.

**Architecture:** Following Matt Pocock's Codebase Design and Clean Architecture principles: (1) Replace duplicated operator folder-ingestion loops with a reusable `createOneDriveFolderPort` deep module; (2) Invert infrastructure leakage in `graph-mail-client` so it no longer imports domain constants or operator-branded types, while preserving backwards-compatible aliases; (3) Explicitly name decimal string money formatting in `money.ts` to prevent semantic collision with `utils.ts`'s Brazilian Real currency formatter.

**Tech Stack:** TypeScript, Vitest, Next.js, Prisma, Microsoft Graph API.

---

## Tasks

### Task 1: Disambiguate Currency Formatting in `src/lib/money.ts`
- **Files:**
  - Modify: `src/lib/money.ts`
  - Modify: `src/lib/impcg/access.ts`
  - Modify: `src/lib/cassems/access.ts`
  - Modify: `src/lib/unimed-cg/access.ts`
  - Test: `src/lib/__tests__/money.test.ts`

### Task 2: Purify `graph-mail-client.ts` (Domain Inversion & Generic Types)
- **Files:**
  - Modify: `src/lib/graph-mail-client.ts`
  - Modify: `src/lib/cassems/ingest.ts`
  - Modify: `src/lib/unimed-cg/ingest.ts`
  - Modify: `src/lib/unimed-cg/ingest-email-html.ts`
  - Modify: `src/lib/impcg/ingest.ts`
  - Create: `src/lib/__tests__/graph-mail-client-types.test.ts`

### Task 3: Create `createOneDriveFolderPort` Deep Module & Unify `isPdfItem`
- **Files:**
  - Modify: `src/lib/onedrive-client.ts`
  - Create: `src/lib/onedrive-folder-port.ts`
  - Modify: `src/lib/cassems/folder-ingest.ts`
  - Modify: `src/lib/impcg/folder-ingest.ts`
  - Modify: `src/lib/documentos/onedrive-port.ts`
  - Create: `src/lib/__tests__/onedrive-folder-port.test.ts`

### Task 4: PR Creation, CI Verification, and Merge
- [ ] Commit changes with clear conventional commit messages.
- [ ] Push branch `refactor/arch-deepening-wave-4` to `origin`.
- [ ] Create Pull Request via GitHub REST API with auto-merge.
- [ ] Monitor GitHub Actions workflow run until all quality, app, and change checks pass.
- [ ] Verify merge into `main` and sync local workspace.
