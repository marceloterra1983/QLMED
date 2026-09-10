# Apply code-review findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os achados do `/code-review` (eixos Standards e Spec) que ainda estão abertos no working tree `fix/ultrareview-corrections`, sem reabrir o WIP de logo DANFE.

**Architecture:** A maior parte dos bugs do ultrareview já está no tree. Este plano só trata o residual: (1) contrato do ledger ENTRADA_NFE vs REQ-002, (2) testes que o Constitution I exige e ainda faltam, (3) higiene de callers ANVISA, (4) desmisturar o WIP de logo. Sem módulos novos além de um teste de rota e um teste Graph.

**Tech Stack:** Next.js App Router, Prisma, Vitest, TypeScript 6.

**Spec:** `specs/056-estoque-controle/spec.md` (REQ-002, REQ-004, REQ-008, REQ-009, AC-003) + `gates/ultrareview-fixes.md` + relatório `/code-review` desta sessão.

## Global Constraints

- Isolamento por empresa: `companyId` só via helpers de auth (`getOrCreateSingleCompany`), nunca do body.
- UI/copy em pt-BR; Zod nas rotas; alias `@/*` → `./src/*`.
- Sem log de XML fiscal, tokens ou `.env`.
- Integrações com timeout limitado (já há `AbortSignal.timeout` / `perRequestSignal`).
- Lista fechada de ficheiros por tarefa; proibido `git add -A`.
- Não commitar `GATES.md` de logo, `public/brand/`, `.playwright-mcp/`.
- `npx tsc --noEmit` e os testes da tarefa têm de ficar verdes antes de passar à seguinte.

## Já aplicado (não reabrir)

| Achado | Estado no tree |
|---|---|
| Trimestre UTC / Constitution IV | `getFiscalPeriodRangeFromDate` em `src/lib/fiscal-period.ts`; dashboard só importa; teste `dashboard-quarter-utc.test.ts` |
| NCM TTL 10 min no hit + 30s no null | `at: now`; `ncm-memory-ttl.test.ts` cobre os dois |
| `descricaoProduto` + `classeRisco` só em saúde | `anvisa-api.ts` linhas 96 e 101 |
| `deleteMany`+`createMany` na mesma transação | `recordMovementsFromEntryItems` usa `prisma.$transaction` |
| 502 no validate sem `anvisaSyncedAt` | `acl-company-scope.test.ts` |
| `allocateLotQuantities` partilhado | xml-products + register-entry |

## Decisão travada (Spec, pior achado)

**REQ-002** pede ledger append-only. Re-registo de entrada **altera quantidades** (lotOverrides). `skipDuplicates` não atualiza qty; compensar com movimentos inversos é um segundo ledger. `seedImpliedOpenings` já faz `deleteMany` da kind `OPENING`.

**Aplicar assim:** ENTRADA_NFE *desta nota* é uma **projeção substituível**, igual ao opening — não a história imutável. Manter `deleteMany`+`createMany` **dentro** de `$transaction`. Tirar `:row${item.id}` da chave (o id muda no `insertNfeEntryItems` e só é único porque o delete corre antes; se o delete for omitido no futuro, a chave com id volta a duplicar). Discriminar linhas iguais (mesmo item/lote/serial) com `seq` 0..n-1 na ordem de `findMany`.

Uma linha em `specs/056-estoque-controle/spec.md` sob REQ-002:

> Exceção: movimentos `ENTRADA_NFE` de uma `invoiceId` são regravados em transação no re-registo da entrada (substituição da projeção, não histórico de correção).

Não aplicar: compensação append-only; migração one-shot de chaves `entrada-item:<id>` (o delete no re-registo já as apaga).

## Não aplicar (judgement / scope)

- Extrair um paginador Graph genérico (Duplicated Code) — o teste do cap chega; o extract não.
- Reverter `eslint`/`vitest` exclude de `.kilo/worktrees/**` — higiene local, inofensiva.
- “NCM null TTL 10 min” — o código certo é 30s; o gate G5 é que estava mal escrito.

---

### Task 1: Ledger — chave estável sem id + nota no spec

**Files:**
- Modify: `src/lib/stock-ledger.ts` (`recordMovementsFromEntryItems`)
- Modify: `src/lib/__tests__/stock-entry-idempotency.test.ts`
- Modify: `specs/056-estoque-controle/spec.md` (REQ-002, uma frase)
- Modify: `src/lib/register-entry.ts` (comentário se ainda disser “chave estável” com id)

**Interfaces:**
- Consome: `recordStockMovements(rows, tx)` já aceita o client da transação.
- Produz: chave `entrada-item:${invoiceId}:item${itemNumber}:lot${lot}:serial${serial}:seq${seq}` com `seq` 0-based por tupla `(itemNumber, lot, serial)` na ordem do array `items`.

- [ ] **Step 1: Alterar o teste existente** (red se a chave ainda tiver `:row99`)

Em `stock-entry-idempotency.test.ts`, o primeiro caso passa a:

```ts
expect(data[0].idempotencyKey).toBe('entrada-item:inv-1:item1:lotL1:serial:seq0');
```

O caso “dois recortes” passa a:

```ts
expect(keys).toEqual([
  'entrada-item:inv-1:item1:lotL1:serial:seq0',
  'entrada-item:inv-1:item1:lotL1:serial:seq1',
]);
```

Manter o expect de `deleteMany` com `{ companyId, invoiceId, kind: 'ENTRADA_NFE' }` e o de `$transaction` (o mock já executa o callback).

- [ ] **Step 2: Correr o teste e ver falhar**

```bash
npx vitest run src/lib/__tests__/stock-entry-idempotency.test.ts
```

Expected: FAIL — recebeu `...:row99`.

- [ ] **Step 3: Implementação mínima**

Substituir o loop em `recordMovementsFromEntryItems` por:

```ts
const seqByTuple = new Map<string, number>();
for (const item of items) {
  const qty = Number(item.lotQuantity ?? item.quantity ?? 0);
  if (qty <= 0) continue;
  const tuple = `${item.itemNumber}:${item.lot ?? ''}:${item.lotSerial ?? ''}`;
  const seq = seqByTuple.get(tuple) ?? 0;
  seqByTuple.set(tuple, seq + 1);
  const codigo = (item.codigoInterno || item.supplierCode || `ITEM-${item.itemNumber}`).trim();
  rows.push({
    // ...campos iguais...
    idempotencyKey: `entrada-item:${invoiceId}:item${item.itemNumber}:lot${item.lot ?? ''}:serial${item.lotSerial ?? ''}:seq${seq}`,
  });
}
```

Não tirar o `deleteMany` nem o `$transaction`.

Em REQ-002, acrescentar a frase da decisão travada.

- [ ] **Step 4: Teste verde**

```bash
npx vitest run src/lib/__tests__/stock-entry-idempotency.test.ts
npx tsc --noEmit --pretty false
```

Expected: 3 testes pass; tsc exit 0.

---

### Task 2: Teste do cap Graph `maxPages`

**Files:**
- Create: `src/lib/__tests__/graph-mail-pagination-cap.test.ts`
- Modify: nenhum production file, salvo se o teste revelar que `listMailboxMessagesBySender` não loga o cap (já loga).

**Interfaces:**
- Consome: `listMailboxMessagesBySender(mailbox, sender, { maxPages })`.
- Produz: para ao `maxPages` e faz `log.warn` com `Graph: pagination truncada em maxPages`.

- [ ] **Step 1: Teste que falha se o loop for infinito / sem cap**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

describe('graph-mail pagination cap', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.TENANT_ID = 't';
    process.env.CLIENT_ID = 'c';
    process.env.CLIENT_SECRET = 's';
    vi.resetModules();
    warn.mockClear();
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('para em maxPages e avisa', async () => {
    let pages = 0;
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.includes('login.microsoftonline.com')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 });
      }
      pages++;
      return new Response(JSON.stringify({
        value: [{ id: `m${pages}`, internetMessageId: `<${pages}@x>`, subject: 's', receivedDateTime: '2026-01-01T00:00:00Z', hasAttachments: true }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/a/messages?$skiptoken=x',
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const { listMailboxMessagesBySender } = await import('@/lib/graph-mail-client');
    const rows = await listMailboxMessagesBySender('mb@x', 'from@x', { maxPages: 3 });
    expect(rows).toHaveLength(3);
    expect(pages).toBe(3);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ pages: 3 }),
      'Graph: pagination truncada em maxPages',
    );
  });
});
```

`assertAllowedHost` tem de aceitar `graph.microsoft.com` (já está em `GRAPH_ALLOWED_HOSTS`).

- [ ] **Step 2: Correr**

```bash
npx vitest run src/lib/__tests__/graph-mail-pagination-cap.test.ts
```

Expected: PASS se o cap já existe (é o caso). Se falhar, o cap está partido — corrigir `listMailboxMessagesBySender` para `options.maxPages ?? 100` como o sibling WithoutAttachments.

- [ ] **Step 3:** Só se o teste falhar. Não extrair paginador partilhado neste passo.

---

### Task 3: Teste de caller `sync-registry` (404 vs erro)

**Files:**
- Create: `src/app/api/products/anvisa/__tests__/sync-registry-anvisa-failure.test.ts`
- Modify: `src/app/api/products/anvisa/sync-registry/route.ts` — só se o teste mostrar o `if (!result)` morto; aí remover `| null` e o ramo.

**Interfaces:**
- Consome: `POST` de `sync-registry`; `fetchAnvisaData` mockado.
- Produz: `failed` incrementa e `updateRegistryAnvisaData` **não** é chamado quando `error` é string; **é** chamado (com `anvisaSyncedAt`) quando `found: false, error: null`.

- [ ] **Step 1: Teste**

Espelhar o mock de `acl-company-scope.test.ts` (`requireEditor`, `getOrCreateSingleCompany`, `fetchAnvisaData`, `updateRegistryAnvisaData`, `getProductRegistryWithAnvisa`). Duas specs:

```ts
it('HTTP 500 não grava anvisaSyncedAt', async () => {
  mocks.fetchAnvisaData.mockResolvedValue({ found: false, data: null, error: 'HTTP 500' });
  mocks.getProductRegistryWithAnvisa.mockResolvedValue([
    { id: 'r1', anvisaCode: '1234567', anvisaMatchedProductName: null, anvisaHolder: null, anvisaProcess: null, anvisaStatus: null, anvisaExpiration: null, anvisaRiskClass: null, anvisaManufacturer: null, anvisaManufacturerCountry: null },
  ]);
  const { POST } = await import('@/app/api/products/anvisa/sync-registry/route');
  const res = await POST(new Request('http://localhost/api/products/anvisa/sync-registry', {
    method: 'POST',
    body: JSON.stringify({ mode: 'all' }),
    headers: { 'content-type': 'application/json' },
  }));
  const json = await res.json();
  expect(json.failed).toBe(1);
  expect(json.notFound).toBe(0);
  expect(mocks.updateRegistryAnvisaData).not.toHaveBeenCalled();
});

it('404 grava syncedAt como não encontrado', async () => {
  mocks.fetchAnvisaData.mockResolvedValue({ found: false, data: null, error: null });
  // mesmo row...
  const json = await (await POST(...)).json();
  expect(json.notFound).toBe(1);
  expect(mocks.updateRegistryAnvisaData).toHaveBeenCalled();
});
```

Ler `anvisaSyncRegistrySchema` antes de escrever o body (`mode: 'all'` vs outro). Se o schema exigir `productKeys`, usar `mode: 'selected'` + keys e mockar `getProductRegistryByKeys`.

- [ ] **Step 2: Correr e ver o vermelho se o ramo de erro estiver errado**

```bash
npx vitest run src/app/api/products/anvisa/__tests__/sync-registry-anvisa-failure.test.ts
```

- [ ] **Step 3: Remover o morto**

Em `sync-registry/route.ts`:

```ts
let result: AnvisaQueryResult;
try {
  result = await fetchAnvisaData(code);
} catch (err) {
  failed += affectedRows.length;
  log.error({ err, code }, 'ANVISA: exceção inesperada na consulta');
  continue;
}
// apagar: `if (!result) { ... }`
```

`fetchAnvisaData` já devolve sempre `AnvisaQueryResult` (união discriminada).

- [ ] **Step 4: Testes + tsc**

```bash
npx vitest run src/app/api/products/anvisa/__tests__/sync-registry-anvisa-failure.test.ts
npx tsc --noEmit --pretty false
```

---

### Task 4: Hygiene do teste 502 (Divergent Change)

**Files:**
- Modify: `src/lib/__tests__/acl-company-scope.test.ts`

**Interfaces:** nenhuma API nova.

- [ ] **Step 1:** Mover o `it('falha de consulta ANVISA não grava anvisaSyncedAt')` para um `describe('ANVISA validate — falha vs notFound')` **depois** do bloco AUTH-002, não dentro dele.

- [ ] **Step 2:**

```bash
npx vitest run src/lib/__tests__/acl-company-scope.test.ts
```

Expected: os mesmos testes verdes (incluindo 502).

---

### Task 5: Um loop em `allocateLotQuantities`

**Files:**
- Modify: `src/lib/product-aggregation/xml-products.ts`
- Test: `src/lib/__tests__/legacy-batch-split.test.ts` (já cobre; não alargar)

**Interfaces:**
- Consome/produz: `allocateLotQuantities<T extends { quantity: number | null }>(lots: T[], totalQty: number): T[]` inalterado.

- [ ] **Step 1:** Extrair helper local (não exportar):

```ts
function fillEqualShare<T extends { quantity: number | null }>(targets: T[], total: number): void {
  const n = targets.length;
  if (n === 0) return;
  let remaining = total;
  for (let i = 0; i < n; i++) {
    if (n === 1) {
      targets[i].quantity = total;
    } else if (i === n - 1) {
      targets[i].quantity = remaining > 0 ? remaining : 0;
    } else {
      const share = Math.floor(total / n);
      targets[i].quantity = share;
      remaining -= share;
    }
  }
}
```

Os dois ramos (todos missing / resto dos missing) chamam `fillEqualShare`.

- [ ] **Step 2:**

```bash
npx vitest run src/lib/__tests__/legacy-batch-split.test.ts src/lib/__tests__/register-entry-lot-overrides.test.ts
```

Expected: pass sem mudar asserts.

---

### Task 6: Desmisturar WIP DANFE deste branch

**Files:**
- Restore: `GATES.md` para o conteúdo de `main` (`git checkout main -- GATES.md`) **ou**, se o saldo-inicial já não for o trabalho desta branch, substituir por um GATES.md desta correção (não o de logo).
- Restore: `.gitignore` linha `!public/logo.png` (`git checkout main -- .gitignore` só se não precisares da exclusão kilo; preferir repor só o `!public/logo.png`).
- Não adicionar: `public/brand/`, `.playwright-mcp/`.

**Interfaces:** nenhuma.

- [ ] **Step 1:** Confirmar que nenhum ficheiro de `src/` referencia `public/brand/ql-med-logo`.

```bash
rg -n "ql-med-logo|public/brand" src
```

Expected: zero hits. Se houver, **parar** — o logo já está ligado e esta tarefa não se aplica.

- [ ] **Step 2:** Restaurar `GATES.md` e a exceção do `logo.png`:

```bash
git show main:GATES.md > GATES.md
# repor só a linha !public/logo.png no .gitignore se tiver sido apagada
```

Não reverter `eslint.config.mjs` / `vitest.config.ts` (exclusão `.kilo/worktrees`).

- [ ] **Step 3:** `git status` — `GATES.md` deixa de falar em DANFE; `public/brand/` continua untracked e fora do commit.

---

### Task 7: Gates desta folha

**Files:**
- Modify: `gates/ultrareview-fixes.md` (G5: texto “null TTL 30s, hit 10 min”)
- Create or update: `gates/review-and-fix.md` já está ALL MET com G2 ABANDON — não reabrir.

- [ ] **Step 1:** Corrigir o enunciado G5 para não exigir 10 min no null.

- [ ] **Step 2:**

```bash
npx tsc --noEmit --pretty false
npx vitest run \
  src/lib/__tests__/stock-entry-idempotency.test.ts \
  src/lib/__tests__/graph-mail-pagination-cap.test.ts \
  src/app/api/products/anvisa/__tests__/sync-registry-anvisa-failure.test.ts \
  src/lib/__tests__/acl-company-scope.test.ts \
  src/lib/__tests__/legacy-batch-split.test.ts \
  src/lib/__tests__/ncm-memory-ttl.test.ts \
  src/lib/__tests__/dashboard-quarter-utc.test.ts
```

Expected: tsc exit 0; todos os files `passed`.

---

## Ordem e risco

1 → 2 → 3 → 4 → 5 → 6 → 7. 1 é o único com decisão de domínio. 6 é o único que mexe em ficheiros “sujos” de outro tema.

Não fazer deploy. Não abrir PR até o utilizador pedir. Commits, se pedidos: Conventional Commits por tarefa, paths explícitos.
