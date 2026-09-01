---
id: ADR-0013
status: accepted
date: 2026-09-01
supersedes: null
related_specs:
  - SPEC-002
  - SPEC-004
---

# FK nas satélites por constraint, e a ordem do contract de Decimal

## Context

A auditoria b177b07 encontrou os dois itens que [ADR-0006](0006-satellite-stores-prisma-client.md)
tinha deixado como trabalho residual de schema:

- **QLMED-DATA-001 (high)**: as 9 tabelas satélite com coluna de tenant ou de
  nota viviam sem FK. `DELETE /api/invoices/[id]` apagava só a linha de
  `Invoice`; `invoice_tax_totals`, `invoice_item_tax`, `invoice_duplicata`,
  `stock_entry` e `nfe_entry_item` ficavam órfãos, apontando para um id que já
  não existia. Nada — nem banco, nem aplicação — limpava aquilo.
- **QLMED-DATA-005 (medium)**: 80 colunas `Float` para dinheiro e imposto.
  A SPEC-004 fez o *expand* de três delas em `invoice_duplicata`, com
  dual-write num sidecar `Decimal`, mas a leitura financeira continuou a ler o
  `Float`. O *contract* nunca aconteceu, e o expand sozinho não corrige nada:
  paga o custo de escrever duas vezes e não colhe a precisão.

## Decision drivers

- Uma exclusão de nota tem N caminhos: a rota, o cascade a partir de `Company`,
  scripts de operação, testes de integração. Uma correção que cubra um só
  caminho é uma correção que o próximo caller esquece.
- Converter 80 colunas de uma vez é uma migração longa sobre tabelas grandes,
  com risco alto e benefício difuso. Nem toda coluna `Float` decide dinheiro.
- Erro de IEEE-754 aparece na **soma**, não na leitura de uma linha. Onde não há
  soma, `Float` não produz defeito observável.

## Considered options

### A — Apagar as satélites dentro da transação da rota

`prisma.$transaction` na rota de DELETE, apagando cada satélite antes da nota.
Não exige migração e não pode falhar por órfão preexistente.

Custo: cobre um caminho de exclusão só. O cascade a partir de `Company` continua
deixando órfão; qualquer novo caller precisa lembrar de repetir a lista; e a
lista de satélites passa a viver em código de rota, longe do schema.

### B — FK no banco, com `ON DELETE` explícito

Uma constraint por relação, no molde que o resto do schema já usa.

Custo: falha em cima de dado existente se já houver órfão — o que exige contagem
prévia contra o banco de produção, que nenhuma sessão de auditoria pode abrir.

## Decision

**Opção B.** A integridade referencial é responsabilidade do banco. A constraint
cobre todos os caminhos de exclusão ao mesmo tempo, não pode ser esquecida por um
caller novo, e fica declarada ao lado da coluna que ela protege.

Ações de delete escolhidas:

| Origem | Ação | Por quê |
|---|---|---|
| `Invoice` → tax_totals, item_tax, duplicata, stock_entry, nfe_entry_item | `CASCADE` | A linha satélite é derivada da nota. Sem a nota ela não significa nada. |
| `stock_entry` → nfe_entry_item | `CASCADE` | Item de entrada pertence à entrada. |
| `Invoice` → `contact_fiscal.source_invoice_id` | `SET NULL` | É procedência, não posse. A ficha fiscal do contato sobrevive à nota que a originou. |
| `Company` → todas as satélites com `company_id` | `CASCADE` | Fronteira de tenant, igual ao que `Invoice` e `SyncLog` já faziam. |
| `User` → `Company` | `RESTRICT` (QLMED-INFO-002) | Era `CASCADE`: apagar um usuário levaria a empresa, as notas e todo o XML fiscal. |

`ncm_cache` e `cnpj_cache` ficam sem FK de propósito: são caches globais, sem
`company_id` nem `invoice_id`.

O risco da opção B é tratado, não ignorado: a migração
`20260902100000_satellite_foreign_keys` traz no cabeçalho a query de contagem de
órfãos, tabela a tabela, e está marcada `NEEDS AUTHORIZED LIVE EVIDENCE` — a
contagem não foi corrida contra o banco canônico. Se alguma linha vier `> 0`, o
deploy decide o destino daquelas linhas antes de aplicar; a FK não se relaxa.

Três índices acompanham as FKs (`contact_fiscal.source_invoice_id`,
`stock_entry.invoice_id`, `nfe_entry_item.invoice_id`): o Postgres não indexa
coluna de FK sozinho, e os índices que já existiam têm `company_id` à frente, o
que faria cada `DELETE` de nota varrer a filha inteira.

### Ordem do contract de Decimal (QLMED-DATA-005)

O caminho de leitura é corrigido agora; a conversão das colunas fica em fases,
por quem decide dinheiro:

**Feito nesta rodada** — leitura, sem migrar coluna:

- `invoice_duplicata.dup_valor`, `.fatura_valor_original`, `.fatura_valor_liquido`:
  a leitura passa a preferir o sidecar `Decimal` que o dual-write já escrevia.
- O resumo de contas a pagar/receber deixa de acumular com `+=` em `number` e
  passa por `addMoney` (Decimal, half-up, 2 casas). Era ali que o erro aparecia:
  o total do topo da tela não fechava com a soma das linhas debaixo dele.

**Fase 1 — adiada, prioridade alta** (dinheiro que aparece somado na tela):

- `stock_entry`: `total_value`, `tot_vprod`, `tot_vnf`, `tot_vdesc`, `tot_vicms`,
  `tot_vicms_st`, `tot_vipi`, `tot_vpis`, `tot_vcofins`, `tot_vfcp`, `tot_vbc`,
  `tot_vbc_st`, `tot_vfrete`, `tot_vseg`, `tot_voutro` (15).
- `nfe_entry_item`: `total_value_gross`, `total_value_net`, `item_discount`,
  `unit_price`, `rateio_frete`, `rateio_seguro`, `rateio_outras_desp`,
  `rateio_desconto` (8).

**Fase 2 — adiada, prioridade média** (imposto agregado por período):

- `invoice_tax_totals`: as 12 colunas `v*`.
- `invoice_item_tax`: `total_value`, `unit_price`, `valor_icms`, `valor_pis`,
  `valor_cofins`, `valor_ipi`, `valor_fcp`, `base_icms` (8).
- `nfe_entry_item`: `valor_icms`, `valor_icms_st`, `valor_ipi`, `valor_pis`,
  `valor_cofins`, `valor_fcp`, `base_icms`, `base_icms_st`, `base_ipi`,
  `base_pis`, `base_cofins` (11).

**Fase 3 — adiada, prioridade baixa** (não decide valor financeiro):

- Alíquotas (`aliq_*`, `fiscal_icms`, `fiscal_pis`, `fiscal_cofins`,
  `fiscal_ipi`, `fiscal_fcp`): percentual, nunca somado em dinheiro.
- Quantidades (`quantity`, `lot_quantity`, `agg_total_quantity`,
  `agg_resale_quantity`).
- `product_registry.anvisa_confidence`: score, não dinheiro.
- Agregados de `product_registry` (`agg_total_value`, `agg_last_price`,
  `agg_average_price`, `agg_last_sale_price`): recomputáveis, e o preço médio já
  é uma aproximação por definição.

Cada fase é expand → dual-write → migrar leitura → contract, como a SPEC-004
começou. Nenhuma fase começa sem contagem autorizada de divergência
`Float` × `Decimal` em produção — se as duas colunas já divergem hoje, a ordem de
migração muda.

## Consequences

### Positive

- Apagar nota ou empresa deixa de gerar órfão, por qualquer caminho.
- Apagar usuário com empresa passa a ser recusado pelo banco.
- O resumo financeiro fecha com a soma das linhas que ele resume.
- A ordem do contract está escrita, com critério, em vez de "converter tudo".

### Negative

- O deploy ganha um passo humano: a contagem de órfãos antes da migração.
- `product_registry.company_id` com `CASCADE` significa que apagar a empresa
  apaga o catálogo de produtos. É o comportamento correto num app single-company,
  mas é destrutivo e vale registrar.
- 77 colunas `Float` continuam lá. O contract é plano, não entrega.

## Verification

- `src/lib/__tests__/audit-l8-schema.test.ts` lê `prisma/schema.prisma` e falha
  se uma FK ou um `onDelete` sumir.
- `src/lib/__tests__/audit-l8-cascade.integration.test.ts`
  (`RUN_DB_INTEGRATION_TESTS=1`) apaga uma nota de verdade e conta as satélites.
- `src/lib/__tests__/audit-l8-financeiro-decimal.test.ts` usa parcelas que não
  fecham em binário e exige que o total feche.
- `npm run db:migrate:verify` replaya o histórico do zero e compara com o schema.
