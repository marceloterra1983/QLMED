# Gates: L7 — cursor de sincronização (FISCAL-007, FISCAL-008, OBS-002)

Scope: o cursor (NSU) só avança sobre documento comprovadamente processado; a
recuperação de "stuck" passa a exigir liveness real (advisory lock de sessão do
Postgres, que morre com a conexão); o heartbeat sabe envelhecer.

Referência de comportamento correto já no repo: `syncViaNsdocs` — só avança
`lastSyncAt` quando `skippedCount === 0`.

## FISCAL-007 — cursor não avança sobre documento que falhou

- [x] G1: SEFAZ — doc que falha no meio do lote congela o NSU antes dele
  CHECK: npx vitest run src/lib/__tests__/sync-cursor-integrity.test.ts -t 'SEFAZ'
  EXPECT: lastNsu persistido == (NSU do doc que falhou) - 1, NÃO o ultNSU do lote
  EVIDENCE: lote NSU 10/11/12, upsert do 11 lança → `certificateConfig.update`
  gravou `lastNsu: '000000000000010'`. Teste "congela o NSU imediatamente antes
  do documento que falhou no meio do lote" passa.

- [x] G2: SEFAZ — lote 100% OK avança até o ultNSU do lote (sem regressão)
  EXPECT: lastNsu == response.ultNSU
  EVIDENCE: lastNsu '000000000000012' == ultNSU do lote; syncLog 'completed',
  skippedDocs 0.

- [x] G3: SEFAZ — doc descartado dentro do client (gunzip/base64) também bloqueia
  EVIDENCE: `DistDFeResponse.failedNsus` adicionado em src/lib/sefaz-client.ts e
  consumido em sync-strategies/sefaz.ts. Com failedNsus=['…011'] e ultNSU '…012',
  o cursor gravado foi '000000000000010'.

- [x] G4: SEFAZ — resposta de erro não avança o cursor
  EVIDENCE: cStat 656 com ultNSU '000000000000099' e cert.lastNsu
  '000000000000005' → gravou '000000000000005'. Linha removida:
  `// Always advance ultNSU even on error`.

- [x] G5b: SEFAZ — XML inválido deixa o lastNsu inalterado (teste pedido no brief)
  EVIDENCE: parse nulo e `applyNfeCancellation` false no NSU 6 → cursor mantido
  em '000000000000005' (valor de entrada), syncLog 'partial' com motivo
  `parse_falhou_schema_desconhecido`.

- [x] G5: Receita NFS-e — parse falho num NSU congela o cursor no NSU anterior
  EXPECT: result.lastNsu == NSU anterior ao que falhou; skippedDocs > 0
  EVIDENCE: NSU 1 OK, NSU 2 com doc ilegível → `result.lastNsu ===
  '000000000000001'`, `skippedDocs === 1`, motivo `nsu=000000000000002 …`.

- [x] G6: Receita NFS-e — run com skip vira `partial`, não `completed`
  EVIDENCE: syncLog.update com `{status:'partial', skippedDocs:1}` e
  `receitaNfseConfig.lastNsu` mantido em '000000000000000'.

- [x] G7: Controlo positivo FISCAL-007 — reverter a correção deixa VERMELHO
  REVERSÃO 1 (SEFAZ): `ultNSU = maxNsu(ultNSU, previousNsu(primeiroFalho))`
  trocado por `ultNSU = maxNsu(ultNSU, response.ultNSU)`.
  SAÍDA EXATA:
    FAIL … > congela o NSU imediatamente antes do documento que falhou no meio do lote
    AssertionError: expected '000000000000012' to be '000000000000010' // Object.is equality
    FAIL … > XML inválido (parse falha e não é cancelamento) deixa o lastNsu inalterado
    AssertionError: expected '000000000000012' to be '000000000000005' // Object.is equality
    FAIL … > trava o cursor também no documento que o client não conseguiu abrir
    AssertionError: expected '000000000000012' to be '000000000000010' // Object.is equality
    Tests  3 failed | 3 passed | 3 skipped (9)
  REVERSÃO 2 (Receita): `cursorBlocked = true` trocado por `cursorBlocked = false`.
  SAÍDA EXATA:
    FAIL … > para no NSU anterior quando um documento do NSU não é gravável
    AssertionError: expected '000000000000002' to be '000000000000001' // Object.is equality
    FAIL … > marca a corrida como partial em vez de completed quando pulou documento
    AssertionError: expected '000000000000001' to be '000000000000000' // Object.is equality
    Tests  2 failed | 1 passed | 5 skipped (8)
  RESTAURO: 8 passed (8).

## FISCAL-008 — lock de execução com liveness real

- [x] G8: `recoverStuckSyncLogs` NÃO fecha log cujo lock de execução está tomado
  CHECK: npx vitest run src/lib/__tests__/sync-stuck-recovery.test.ts
  EVIDENCE: log com 90 min em 'running' e `acquire → null` → `syncLog.update`
  não chamado.

- [x] G9: `recoverStuckSyncLogs` fecha log órfão (lock livre) e liberta o lock
  EVIDENCE: update com `status:'error'` e errorMessage contendo "lock de
  execução livre"; `release()` chamado 1×, inclusive quando o update rejeita.

- [x] G10: As 3 strategies tomam o lock de execução e libertam no finally
  EVIDENCE: `beginSyncRun` em sefaz.ts, nsdocs.ts e receita-nfse-sync.ts, com
  `finally { await run.release(); }`. Verificado por comportamento: no teste de
  erro SEFAZ, `release` foi chamado 1×.

- [x] G11: Strategy sem lock não corre e fecha o syncLog herdado
  EVIDENCE: `pg_try_advisory_lock` devolve `acquired:false` → beginSyncRun lança
  SYNC_ALREADY_RUNNING e chama `syncLog.update({where:{id:'sync-log-herdado'},
  data:{status:'error'}})`.

- [x] G12: Controlo positivo FISCAL-008 — reverter a correção deixa VERMELHO
  REVERSÃO: `if (!lock) { … continue; }` trocado por `if (false) {` (só o
  relógio decide, comportamento antigo).
  SAÍDA EXATA:
    FAIL … > NÃO fecha o log quando o lock de execução continua tomado (processo vivo)
    AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
    FAIL … > decide log a log: fecha o órfão e poupa o vivo no mesmo ciclo
    AssertionError: expected { id: 'vivo' } to deeply equal { id: 'orfao' }
    Tests  2 failed | 2 passed (4)

## OBS-002 — heartbeat que envelhece

- [x] G13: heartbeat velho vira `stale` na leitura
  CHECK: npx vitest run src/lib/__tests__/background-service-health.test.ts
  EVIDENCE: limiar de 2 ciclos (2 × intervalo, como pedido no brief). Intervalo
  60s: a 4 ciclos sem bater → `status:'stale'`, `lastHeartbeatAgeMs: 240000`,
  `staleAfterMs: 120000`. Caso literal do brief: heartbeat de 1h atrás não
  reporta 'running'.

- [x] G14: heartbeat fresco continua `running`; `disabled`/`error` não viram stale
  EVIDENCE: 1 ciclo → 'running'; `enabled:false` a 100 ciclos → 'disabled';
  serviço em 'error' a 10 ciclos → 'error' com lastError preservado. Ingest de
  e-mail (15 min): 30 min → 'running', 31 min → 'stale'.

- [x] G15: Controlo positivo OBS-002 — reverter a correção deixa VERMELHO
  REVERSÃO: `const status = record.status === 'running' && …` prefixado com
  `false &&` (estado guardado devolvido cru, comportamento antigo).
  SAÍDA EXATA:
    FAIL … > vira stale quando o batimento passa do limiar, sem ninguém escrever nada
    AssertionError: expected 'running' to be 'stale' // Object.is equality
    FAIL … > o batimento seguinte rejuvenesce o serviço
    AssertionError: expected 'running' to be 'stale' // Object.is equality
    FAIL … > heartbeat de uma hora atrás NÃO reporta running
    AssertionError: expected 'running' not to be 'running' // Object.is equality
    FAIL … > respeita o intervalo declarado por cada serviço (15 min no ingest de e-mail)
    AssertionError: expected 'running' to be 'stale' // Object.is equality
    Tests  4 failed | 3 passed (7)

## Portões finais

- [x] G16: `npm run typecheck` limpo
  EVIDENCE: `> tsc --noEmit` sem saída.

- [x] G17: `npm run lint` limpo
  EVIDENCE: `> eslint .` sem saída.

- [x] G18: `npm test` verde, contagem antes vs depois medida
  ANTES:  Test Files 94 passed | 3 skipped (97); Tests 725 passed | 4 skipped (729)
  DEPOIS: Test Files 96 passed | 3 skipped (99); Tests 747 passed | 4 skipped (751)
  DELTA: +2 ficheiros, +22 testes, 0 regressões.

- [x] G19: Nenhum ficheiro proibido tocado
  EVIDENCE: `git status --short` — 12 modificados + 3 novos; nenhum é
  src/lib/auth.ts, prisma/schema.prisma, prisma/migrations/, .github/workflows/
  nem src/lib/logger.ts. Nenhuma coluna nova foi precisa (o lock é advisory,
  não persistido; o stale é derivado na leitura).

- [x] G20: Branch `fix/audit-l7-cursor` empurrada para origin
  EVIDENCE: ver relatório final.
