# Quickstart: SPEC-021

## Pré-requisito

Worktree da feature com `node_modules` (symlink do checkout canônico).

## Evidência

```bash
npx vitest run src/lib/__tests__/daily-issued-summary.test.ts
npm run docs:validate
npx tsc --noEmit
npm run lint
npm test
```

Esperado: cabeçalho de dia misto (venda 4.800 + consignação 5.890,85)
→ `saleCount === 1`, `saleTotal === 4800`. Sufixo `(CONSIG.)` intacto.

## Envio real (fora do git do produto)

1. Conferir `isVenda` + filtro `sales` em
   `~/ops/n8n/qlmed-workflows-snapshot/dailysummaryissued01.json`.
2. Promover só depois do review:
   `~/ops/scripts/n8n-promote.sh promote <arquivo.json> qlmed --execute-approved`
