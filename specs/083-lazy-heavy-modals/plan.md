---
id: PLAN-083
status: approved
owner: QLMED
---

# Plan: SPEC-083 — lazy-load de modais pesados

## Constitution check

- Sem schema, sem ROLE-001, sem contrato HTTP novo (I).
- UI pt-BR inalterada; só o momento do download do chunk muda (IV).
- Evidência: teste de `next.config` + card-view-mode existente (I).
- Isolamento de empresa inalterado (II).

## Approach

1. **Mesmo padrão das listas fiscais.** `next/dynamic(..., { ssr: false })`
   já usado em `fiscal/issued`, `invoices`, `cte`, `nfse-recebidas`,
   `financeiro` e `ContactListPageClient`.
2. **Produtos.** Seis modais fora do chunk da tabela.
3. **Contact + estoque.** Nested dynamic dos modais fiscais; o próprio
   `ContactDetailsModal` continua estático nas rotas de detalhe (é o
   conteúdo da página).
4. **serverExternalPackages.** ExcelJS/JSZip/Puppeteer só no servidor;
   não entram no bundle RSC.

## Files

- `src/app/(painel)/cadastro/produtos/page-client.tsx`
- `src/components/ContactDetailsModal.tsx`
- `src/app/(painel)/estoque/controle/components/ProductStockDetailModal.tsx`
- `next.config.mjs`
- `src/lib/__tests__/next-config-server-externals.test.ts`

## Complexity

Rejeitado Next 16 Cache Components. Rejeitado React Compiler.
Rejeitado `optimizePackageImports` sem biblioteca barrel (sem lucide/date-fns).
