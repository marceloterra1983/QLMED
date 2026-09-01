# Gates — L6 ofícios IMPCG/CASSEMS

Base: `b177b07`. Branch: `fix/audit-l6-oficios`.
Findings: QLMED-JOB-001..005 (brief da auditoria, commit `2afe12f`).

Regra: só marco `[x]` com saída medida colada em EVIDENCE. Nunca "pending".
Controlo positivo obrigatório: reverter a correção tem de deixar o teste novo
VERMELHO, com o erro exato registado.

---

## G0 — linha de base medida antes de editar

- [x] `npm ci && npx prisma generate` sem erro
- [x] `npm test` na base

CHECK: `npm test`
EXPECT: contagem registada para comparar no fim.

EVIDENCE:
```
Test Files  94 passed | 3 skipped (97)
     Tests  725 passed | 4 skipped (729)
```

---

## G1 — JOB-001: objeto no OneDrive nunca fica órfão com PHI

Invariante: objeto remoto e linha DB commitam juntos, ou o remoto é recolhido.

Decisão: **coleta de órfãos por ação compensatória**, não "mover para dentro da
transação". Um PUT no Graph não se inscreve numa transação Postgres: dentro do
`prisma.$transaction` o rollback não desfaz o objeto e ainda seguraria a ligação
de banco durante I/O de rede. O que se pode garantir é compensar.

- [x] `persistConfirmed`/`persistUpgrade` a falhar não aborta mais o tick inteiro
- [x] falha de persist apaga o objeto recém-enviado quando nenhuma linha o referencia
- [x] objeto que uma autorização já commitada referencia NÃO é apagado
- [x] falha do próprio delete vira erro material (visível no `ok` e no `lastError`)
- [x] permissão de delete verificada na fonte, não assumida:
      `GRAPH_SCOPE = 'offline_access User.Read Files.ReadWrite'`
      (`src/lib/onedrive-client.ts:3`) — `Files.ReadWrite` cobre DELETE

CHECK: `npx vitest run src/lib/__tests__/oficio-persist-compensation.test.ts`
EXPECT: persist lança → `deletePdf` chamado com o itemId do upload; nenhuma
autorização criada; `ok:false`. No caminho de upgrade com itemId já referenciado,
`deletePdf` NÃO é chamado.

EVIDENCE:
```
Test Files  1 passed (1)
     Tests  6 passed (6)
```
Controlo positivo: ver G7.

---

## G2 — JOB-002: `persistSourceOnly` só engole violação de unicidade

- [x] erro com `code === 'P2002'` continua sendo skip silencioso
- [x] qualquer outro erro propaga e é contado pelo chamador

CHECK: `npx vitest run src/lib/__tests__/oficio-persist-source-only.test.ts`
EXPECT: erro genérico → rejeita e o tick conta `failedPersists`; P2002 → resolve.

EVIDENCE:
```
Test Files  1 passed (1)
     Tests  5 passed (5)
```
Controlo positivo: ver G7.

---

## G3 — JOB-003: aviso WhatsApp tem repetição durável

Invariante: falha de notificação depois da origem persistida entra numa máquina
de entrega, não se perde.

- [x] mensagem com origem persistida e `whatsappSentAt IS NULL` é reprocessada
      no tick seguinte
- [x] reprocessamento NÃO faz upload nem cria linha nova
- [x] `whatsappSentAt` preenchido ⇒ nunca reenvia
- [x] canal desligado ou fora da janela ⇒ nem sequer busca o anexo (sem custo Graph)
- [x] duas caixas no mesmo tick ⇒ uma única tentativa por mensagem

CHECK: `npx vitest run src/lib/__tests__/oficio-whatsapp-outbox.test.ts`
EXPECT: 1º tick Evolution 500 → `sent=0`, `ok:false`; 2º tick Evolution 200 →
`sent=1`, `whatsappSentAt` gravado, sem upload novo.

EVIDENCE:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
```
Controlo positivo: ver G7.

---

## G4 — JOB-004: `ok` honesto e `lastSuccessAt` que não mente

Invariante: sucesso operacional exige caixa + upload + persist + aviso honestos.

- [x] falha parcial (uma caixa falha, outra passa) ⇒ `ok:false`
- [x] `lastSuccessAt` anterior fica INTACTO na falha parcial
- [x] `backfillCompletedAt` não é declarado completo num tick parcial
- [x] tick 100% limpo continua `ok:true` e avança `lastSuccessAt`
- [x] rota `/sync` devolve o `ok` do pipeline e expõe `failedUploads`/`failedPersists`
- [x] UI para de anunciar "Coleta concluída" quando `ok:false`

CHECK: `npx vitest run src/lib/__tests__/oficio-ok-honesto.test.ts`
EXPECT: caixa `marcelo` em 403 + caixa `flavio` com ofício válido → `ok:false`,
`processed:1`, `lastSuccessAt` === valor anterior (não `now`).

EVIDENCE:
```
Test Files  1 passed (1)
     Tests  8 passed (8)
```
Duas asserções existentes afirmavam `result.ok === true` com as caixas em 403
(`impcg-folder-backfill.test.ts`, `cassems-folder-scan.test.ts`): eram os testes
que protegiam o defeito, e foram viradas para `false` com o motivo no comentário.

Controlo positivo: ver G7.

---

## G5 — JOB-005: outbox fiscal tem teto de tentativas e retenção

- [x] `attempts >= 5` sem submissão ao provedor ⇒ `dead`, não `retry` eterno
- [x] falha DEPOIS da submissão continua a decidir-se por `uncertain` (humano)
- [x] purga de eventos terminais antigos existe e é configurável
- [x] purga preserva evento com entrega não terminal, independentemente da idade
- [x] contrato da rota `/api/notifications/outbox/ack` inalterado (n8n segue igual)
- [x] `createInvoiceWithOutbox` (emissão NF-e, item 1) não foi tocado

CHECK: `npx vitest run src/lib/__tests__/notification-outbox-dead-letter.test.ts`
EXPECT: 5ª falha pré-submissão grava `status: 'dead'`; 4ª ainda grava `retry`.

EVIDENCE:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
```
Controlo positivo: ver G7.

---

## G6 — portões do repo verdes

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run docs:validate`

EVIDENCE:
```
tsc --noEmit    → exit 0, sem saída
eslint .        → exit 0, sem saída
vitest run      → Test Files 99 passed | 3 skipped (102)
                  Tests 758 passed | 4 skipped (762)
docs:validate   → Documentation validation passed (152 Markdown files, 46 IDs)
```

---

## G7 — controlo positivo de cada correção

Cada linha: reverter SÓ aquela correção, correr o teste, exigir VERMELHO,
restaurar. Erro exato transcrito.

- [x] JOB-001: removida a chamada `collectOrphanUpload` em `impcg/ingest.ts`
```
× IMPCG: persist falha ⇒ objeto recém-enviado é apagado
× IMPCG: delete da compensação falhar vira erro material
AssertionError: expected "vi.fn()" to be called with arguments: [ 'od-novo' ]
Tests  2 failed | 4 passed (6)
```

- [x] JOB-002: `catch` voltou a engolir tudo em `impcg/store.ts`
```
× IMPCG: erro genérico do banco não é engolido como dedup
AssertionError: promise resolved "undefined" instead of rejecting
Tests  1 failed | 4 passed (5)
```

- [x] JOB-003: voltou `if (existingSource) { skipped += 1; continue; }`
```
× IMPCG: Evolution 500 no 1º tick, entregue no 2º
AssertionError: expected [] to have a length of 1 but got +0
Tests  1 failed | 6 passed (7)
```

- [x] JOB-004: voltou `const ok = true` e `lastSuccessAt: now` incondicional
```
× IMPCG: uma caixa falha e outra passa ⇒ ok:false com lastSuccessAt intacto
× IMPCG: falha de upload ⇒ ok:false e lastSuccessAt intacto
× IMPCG: tick parcial não declara backfillCompletedAt
× IMPCG: aviso WhatsApp que falha mantém ok:false
AssertionError: expected true to be false // Object.is equality
Tests  4 failed | 4 passed (8)
```

- [x] JOB-005: `resolveDeliveryOutcome` voltou a devolver o outcome cru
```
× 5ª falha pré-submissão vira dead
AssertionError: expected 'retry' to be 'dead' // Object.is equality
Tests  1 failed | 6 passed (7)
```

Após restaurar as cinco: `grep -rn "CONTROLO POSITIVO" src/` → nenhum marcador
residual; suíte de volta a 758 passed.

---

## Fora de escopo (contrato do PLAN.md)

- `prisma/schema.prisma` e `prisma/migrations/` — L8. Nenhuma alteração de schema
  foi necessária para as cinco correções. O delta OPCIONAL para migrar o aviso de
  ofício às tabelas do outbox fiscal vai descrito no relatório, não aplicado.
- `src/lib/auth.ts`, `src/lib/logger.ts`, `.github/workflows/` — outras folhas.
- Nenhuma chamada real a Graph, OneDrive, Evolution, n8n ou produção. Nenhum PDF
  clínico real, nenhum `.env` lido. Fixtures sintéticas (`%PDF-1.4 fixture`).
