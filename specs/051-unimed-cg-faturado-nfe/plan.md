# Plan: SPEC-051 Unimed CG faturado NF-e

## Technical approach

1. Prisma: campos nullable em `UnimedCgAuthorization` + migration SQL expand-only; pin SHA.
2. `src/lib/unimed-cg/billing-match.ts`: fold via `foldName`, `extractInfCpl`, match ≥2 tokens, `runUnimedCgBillingMatch(companyId, opts?)`.
3. `authorize.ts` `finalizeAuthorized` (+ early authorized returns com invoice): se digits(dest) === constante, fire-and-forget / await match scoped.
4. `ingest.ts`: após backfill patient names, `await runUnimedCgBillingMatch(companyId)`.
5. `store.ts` + route GET: listar matched como `billed`; excluir processIds matched das outras listas.
6. `page-client.tsx`: Section PROCESSOS FATURADOS; subitens por kind; tag amarela → InvoiceDetailsModal.
7. system-routines: enriquecer descrição unimed-cg-mail-ingest (match + emissão).
8. Testes vitest + pin test.

## Constitution check

- Evidence: vitest + migration pin + tsc
- Auth: API usa requireUnimedCgPage existente
- Expand-only migration
- Domain logic in `src/lib/unimed-cg`
