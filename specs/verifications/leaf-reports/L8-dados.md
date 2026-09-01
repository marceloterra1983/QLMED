# Gates — L8 (integridade de dados)

Auditoria QLMED b177b07. Uma caixa por resultado. `[x]` só com evidência medida,
colada em EVIDENCE. Controlo positivo obrigatório: reverter a correção deixa o
teste novo VERMELHO, com a saída exata registada.

Base medida antes de editar código:

```
$ npm test
 Test Files  94 passed | 3 skipped (97)
      Tests  725 passed | 4 skipped (729)
```

Banco usado nas verificações: container descartável `qlmed-l8-scratch`
(`postgres:16-alpine`, porta 55432, base `qlmed_ci`). **O Postgres canónico em
127.0.0.1:5432 nunca foi aberto.**

---

## [x] G1 — DATA-001: satélites sem FK deixam órfãos ao apagar Invoice

- CHECK: `prisma/schema.prisma` declara `@relation` para todo `invoiceId` /
  `companyId` de tabela satélite (excepto caches globais `ncm_cache` e
  `cnpj_cache`, que não têm tenant).
- CHECK: migração cria as FKs com `ON DELETE CASCADE` e cabeçalho com a query
  de pré-checagem de órfãos.
- EXPECT: teste prova que apagar uma `Invoice` remove tax_totals, item_tax,
  duplicata e stock_entry.
- EXPECT (controlo positivo): remover o cascade deixa o teste vermelho.

EVIDENCE:

16 FKs em 9 tabelas, em `20260902100000_satellite_foreign_keys`. Escolha e
justificação em ADR-0013: constraint no banco, não delete transacional na rota —
a rota é um caminho entre vários (cascade de `Company`, scripts, testes) e a
constraint cobre todos.

```
$ npx vitest run src/lib/__tests__/audit-l8-schema.test.ts
 Test Files  1 passed (1)
      Tests  22 passed (22)

$ RUN_DB_INTEGRATION_TESTS=1 DATABASE_URL=<scratch> \
    npx vitest run src/lib/__tests__/audit-l8-cascade.integration.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Controlo positivo (schema) — `onDelete: Cascade` → `NoAction` em
`InvoiceTaxTotals.invoiceId`:

```
× InvoiceTaxTotals . invoiceId referencia 'Invoice' com onDelete: 'Cascade'
AssertionError: expected 'model InvoiceTaxTotals {\n  invoiceId…' to match
                /Invoice\??\s+@relation\(fields:\s*\[i…/
      Tests  1 failed | 21 passed (22)
```

Controlo positivo (banco) — `DROP CONSTRAINT` das 5 FKs de `invoice_id` no
container descartável:

```
× DELETE de invoice remove tax_totals, item_tax, duplicata, stock_entry e nfe_entry_item
AssertionError: expected 1 to be +0 // Object.is equality
      Tests  2 failed | 3 passed (5)
```

NEEDS AUTHORIZED LIVE EVIDENCE: a contagem de órfãos preexistentes em produção
não foi corrida. A query está no cabeçalho da migração, coberta por asserção em
`audit-l8-schema.test.ts`.

## [x] G2 — DATA-005: leitura financeira usa Float onde há sidecar Decimal

- CHECK: `buildDuplicatas` lê os três sidecars `Decimal` com precedência.
- CHECK: os acumuladores de `summary.*Valor` deixam de usar `+=` em `number`.
- EXPECT: teste com centavos que não fecham em binário.
- EXPECT (controlo positivo): repor `+=` deixa o teste vermelho.

EVIDENCE:

```
$ npx vitest run src/lib/__tests__/audit-l8-financeiro-decimal.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Parcelas `[10.10, 20.20, 30.30, 0.10, 0.20, 0.30]`; o próprio teste mede o
controlo: `expect(somaEmFloat).toBe(61.199999999999996)` antes de exigir 61.20.

Controlo positivo (a) — `addMoney` → `+=`:

```
× o total do resumo bate exatamente com a soma das parcelas exibidas
AssertionError: expected 61.199999999999996 to be 61.2 // Object.is equality
      Tests  1 failed | 2 passed (3)
```

Controlo positivo (b) — `preferDecimal(d.dupValorDecimal, …)` → `d.dupValor`:

```
× usa o sidecar Decimal quando o Float legado divergiu
AssertionError: expected 10.1 to be 10.13 // Object.is equality
× o total do resumo bate exatamente com a soma das parcelas exibidas
AssertionError: expected +0 to be 61.2 // Object.is equality
      Tests  2 failed | 1 passed (3)
```

Colunas migradas / adiadas: ADR-0013, secção "Ordem do contract de Decimal".
3 migradas na leitura, 77 adiadas em 3 fases nomeadas.

NEEDS AUTHORIZED LIVE EVIDENCE: divergência real `Float` × `Decimal` em
produção. A precedência corrige a leitura; não mede o estrago acumulado.

## [x] G3 — DATA-007: `remaining` só conta tax_totals, ignora item_tax

- CHECK: `remaining` considera cobertura de itens.
- CHECK: o predicado de selecção e o de `remaining` são o mesmo — senão o laço
  `while (remaining > 0)` do dashboard nunca termina.
- EXPECT: nota com totals e sem items conta em `remaining`.
- EXPECT: nota já processada não volta a contar.

EVIDENCE:

Coluna nova `invoice_tax_totals.item_count` (migração
`20260902120000_invoice_tax_totals_item_count`). Contar `invoice_item_tax`
diretamente daria `remaining` honesto e laço infinito: NF-e cujo XML não produz
item ficaria em `remaining` para sempre. `item_count` NULL = nunca medido,
0 = medido e sem item.

Os dois escritores de `invoice_tax_totals` foram corrigidos, não só o citado no
finding: a rota de backfill e `product-aggregate-updater.ts:154` (ingestão),
encontrado pelo `tsc` ao tornar `itemCount` obrigatório.

```
$ npx vitest run src/lib/__tests__/audit-l8-invoice-routes.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Controlo positivo — `remaining` volta a `totalNfe - taxTotals.count`:

```
× nota com totais e sem itens medidos volta ao lote e conta em remaining
AssertionError: expected 3 to be 2 // Object.is equality
      Tests  1 failed | 4 passed (5)
```

## [x] G4 — DATA-011: `GET /api/invoices/[id]` devolve `xmlContent` inteiro

- CHECK: a rota usa `select` explícito sem `xmlContent`.
- CHECK: o único consumidor só usa `accessKey`, `number`, `type`.
- EXPECT: a resposta não tem `xmlContent`.

EVIDENCE:

Único consumidor: `src/components/InvoiceDetailsModal.tsx:144`, que guarda
apenas `{ accessKey, number, type }` e busca o XML em `/download` (linha 192).
Nenhum `page-client.tsx` consome esta rota. Verificado por grep em
`src/app` e `src/components`.

```
$ npx vitest run src/lib/__tests__/audit-l8-invoice-routes.test.ts
      Tests  5 passed (5)
```

Controlo positivo — `select` → `include`:

```
× pede um select explícito e xmlContent não está nele
AssertionError: expected undefined to be defined
      Tests  1 failed | 4 passed (5)
```

## [~] G5 — DATA-012: sem retenção em AccessLog, clicks, SyncLog, caches

- CHECK: prazos são decisão do dono/DPO.
- EXPECT: mecanismo com prazo configurável + ADR com a política proposta.

EVIDENCE:

`src/lib/data-retention.ts` — `purgeExpiredOperationalData()`, uma regra por
tabela, prazo por variável de ambiente, sem default numérico no código, e nada o
chama automaticamente. Política proposta em ADR-0014 (`status: proposed`).

```
$ npx vitest run src/lib/__tests__/audit-l8-data-retention.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ npm run docs:validate
Documentation validation passed (154 Markdown files, 48 IDs).
```

Controlo positivo — `parseRetentionDays` ganha default de 90 dias:

```
× sem variável de ambiente, nenhuma tabela é tocada
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
× prazo inválido é recusado como inválido, não tratado como zero
AssertionError: expected 90 to be null
      Tests  3 failed | 3 passed (6)
```

PARCIAL de propósito: os cinco prazos e o acionamento são decisão humana.

## [x] G6 — DATA-013: `$executeRawUnsafe` em `scripts/backfill-tax.ts`

- CHECK: a rota já faz o mesmo trabalho por Prisma.
- EXPECT: `grep` em `scripts/` devolve vazio, com teste que trava a regressão.

EVIDENCE:

Script apagado. A rota `/api/invoices/backfill-tax` cobre as três coisas que ele
fazia: totais, itens e o update de `product_registry` — e faz melhor, com filtro
de `companyId` que o `SELECT` do script não tinha.

```
$ grep -rn "executeRawUnsafe\|queryRawUnsafe" scripts/
scripts/: sem executeRawUnsafe/queryRawUnsafe
```

Controlo positivo — recriar o ficheiro a partir de `b177b07`:

```
× nenhum arquivo em scripts/ usa $executeRawUnsafe ou $queryRawUnsafe
AssertionError: expected [ 'scripts/backfill-tax.ts' ] to deeply equal []
+   "scripts/backfill-tax.ts",
      Tests  1 failed | 21 passed (22)
```

## [x] G7 — FISCAL-006: digest declara C14N e usa substring

- CHECK: identificar onde a serialização diverge do C14N 1.0.
- EXPECT: `esc()` passa a emitir a forma canónica; `signNfeXml` recusa infNFe
  não canónico.
- NÃO: nenhum envio à SEFAZ.

EVIDENCE:

Divergência encontrada e nomeada: `esc()` em `xml-builder.ts` escapava `"` como
`&quot;` em nó de texto. C14N 1.0 §2.3 escapa apenas `&`, `<`, `>` e `#xD` — a
aspa fica literal. Um `"` numa descrição de produto (`Cabo 5"`) fazia o nosso
SHA-1 divergir do que a SEFAZ recalcula, e a nota voltava rejeitada.

O resto do infNFe já era canónico e agora está verificado em vez de assumido:
`xmlns` declarado no próprio `<infNFe>`, atributos em ordem canónica (`Id` antes
de `versao`), sem comentário/CDATA/PI. `signNfeXml` recusa assinar se os bytes
não satisfizerem isso — falha fechada.

```
$ npx vitest run src/lib/__tests__/audit-l8-nfe-digest.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Controlo positivo — `esc()` volta a escapar `"`:

```
× o serializador emite nó de texto na forma canônica: a aspa fica literal
× o DigestValue é SHA-1 do infNFe canônico, não de um substring qualquer
× recusa CR literal e comentário dentro da infNFe
× o SignedInfo assinado carrega o xmlns que a C14N devolve ao embutido
Error: infNFe nao esta na forma canonica C14N 1.0: referencia de caractere que a
       C14N nao emite em no de texto
      Tests  4 failed | 1 passed (5)
```

RSA-SHA1 mantido — é o algoritmo da NF-e 4.00.

## [x] G8 — INFO-002: `Company.userId` com `onDelete: Cascade`

- CHECK: schema passa a `Restrict`; migração recria a FK.
- EXPECT: teste falha se voltar a `Cascade`.

EVIDENCE:

```
$ npx vitest run src/lib/__tests__/audit-l8-schema.test.ts
      Tests  22 passed (22)
```

Controlo positivo (banco) — FK recriada com `ON DELETE CASCADE` no container:

```
× QLMED-INFO-002: apagar usuário com empresa é recusado pelo banco
AssertionError: promise resolved "{ id: 'l8-user-8296166643', …(12) }" instead of rejecting
```

## [x] G9 — as migrações replayam do zero

- CHECK: nunca contra o Postgres canónico.
- EXPECT: `migrate deploy` do zero + `migrate diff --exit-code` devolve 0.
- EXPECT: `npm run db:migrate:verify` corrido, com o resultado registado.

EVIDENCE:

Base `qlmed_ci` derrubada e recriada; histórico replayado do zero:

```
$ DATABASE_URL=<scratch> npx prisma migrate deploy
Applying migration `20260902100000_satellite_foreign_keys`
Applying migration `20260902110000_company_user_restrict`
Applying migration `20260902120000_invoice_tax_totals_item_count`
All migrations have been successfully applied.

$ DATABASE_URL=<scratch> npm run db:migrate:verify
QLMED database configuration is canonical (DATABASE_URL only).
Verifying the production migration-window image contract...
Production migration window static contract passed.
Replaying migration history...
27 migrations found in prisma/migrations
No pending migrations to apply.
Comparing migrated database with prisma/schema.prisma...
No difference detected.
```

O `DATABASE_URL` aponta para a base descartável `qlmed_ci`, que é o alvo que o
próprio `validate-database-config.mjs` aceita como não-persistente.

## [x] G10 — portões do repo

EVIDENCE:

```
$ npm run typecheck
> tsc --noEmit
(sem saída)

$ npm run lint
> eslint .
(sem saída)

$ npm test
 Test Files  99 passed | 4 skipped (103)
      Tests  766 passed | 9 skipped (775)
```

Antes: 94 ficheiros / 725 testes. Depois: 99 ficheiros / 766 testes.
+5 ficheiros de teste unitário, +1 de integração (5 testes, `skipped` sem
`RUN_DB_INTEGRATION_TESTS=1`), +41 testes a passar.
