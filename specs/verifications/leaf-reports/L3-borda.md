# Gates — L3 (credenciais e borda de rede)

Auditoria QLMED b177b07. Uma caixa por resultado. `[x]` só com evidência medida.

**Nota de escopo:** `specs/leaf-briefs/L3-borda.md` e `PLAN.md` NÃO existem neste
worktree (verificado: `ls: cannot access 'specs/leaf-briefs': No such file or
directory`). Os achados INT-001/009/010/011 vêm do enunciado da tarefa e foram
confirmados no código. INT-003/006/007/012/014 chegaram depois, por
mensagem do coordenador, e estão fechados em G9-G13.

Baseline medido antes de qualquer edição:
`Test Files 94 passed | 3 skipped (97) / Tests 725 passed | 4 skipped (729)`

Depois: `Test Files 100 passed | 3 skipped (103) / Tests 795 passed | 4 skipped (799)`

---

## G0 — Ambiente pronto

- [x] `npm ci` e `npx prisma generate` completados.
  - CHECK: `npx vitest run --reporter=dot 2>&1 | tail -3`
  - EXPECT: suíte roda sem `Cannot find module '.prisma/client/default'`
  - EVIDENCE: `Tests  725 passed | 4 skipped (729)`, Duration 8.57s

---

## G1 — Contrato `assertAllowedHost` (L5 e L7 dependem)

- [x] `src/lib/http-allowlist.ts` exporta UMA função com a assinatura exata
      `assertAllowedHost(url: string, allowlist: readonly string[]): URL`.
  - CHECK: `npm run typecheck`
  - EXPECT: exit 0
  - EVIDENCE: exit 0, sem diagnóstico.

- [x] Garante: recusa esquema != https; recusa host fora da allowlist; recusa
      IP literal privado/loopback/link-local; recusa credenciais embutidas.
  - CHECK: `npx vitest run src/lib/__tests__/http-allowlist.test.ts`
  - EXPECT: todos verdes
  - EVIDENCE: `Tests  27 passed (27)`

- [x] Controlo positivo: neutralizar a checagem de allowlist
      (`const allowed = true || allowlist.some(...)`) deixa VERMELHO.
  - EVIDENCE: 4 falhas, incl. `recusa host fora da allowlist` →
    `AssertionError: expected [Function] to throw an error`. Restaurado.

- [x] Dois defeitos REAIS encontrados pelos próprios testes, ao escrevê-los:
      `URL.hostname` mantém os colchetes do IPv6 (`[::1]` escapava de toda faixa
      privada) e o WHATWG normaliza `::ffff:127.0.0.1` para `::ffff:7f00:1`.
  - EVIDENCE: `expected /privado ou loopback/ ... Received: "Egresso recusado:
    host [fc00::1] fora da allowlist"` — corrigido, hoje verde.

---

## G2 — INT-001a: HMAC do webhook n8n é fail-OPEN

Local: `src/app/api/webhooks/n8n/route.ts:41-51` — `if (!secret) return true;`

- [x] Sem `N8N_WEBHOOK_SECRET` configurado o webhook RECUSA (não aceita).
  - CHECK: `npx vitest run src/lib/__tests__/n8n-webhook-edge.test.ts`
  - EXPECT: 401, e nenhum forward disparado
  - EVIDENCE: `Tests  7 passed (7)`; os dois testes de fail-closed cobrem
    "sem secret recusa" e "sem secret, nem assinatura bem formada passa".

- [x] Controlo positivo obrigatório: restaurar `if (!secret) return true;`
      deixa VERMELHO.
  - EVIDENCE: 2 falhas, ambas `AssertionError: expected 200 to be 401`.
    Restaurado.

- [x] Sinal independente: DOIS testes pré-existentes de roteamento
      (`n8n-webhook-route.test.ts`) passavam sem assinatura nenhuma, apoiados no
      fail-open. Passaram a assinar (`signedRequest`).
  - EVIDENCE: as 2 falhas apareceram na suíte completa ao fechar o fail-open.

---

## G3 — INT-001b: `req.text()` sem limite de tamanho

Local: `src/app/api/webhooks/n8n/route.ts:74-79`

- [x] Corpo acima do teto (8 MiB) é recusado com 413. A contagem é do tamanho
      REAL lido em pedaços, não do `content-length`, que é do cliente.
  - CHECK: `npx vitest run src/lib/__tests__/n8n-webhook-edge.test.ts`
  - EXPECT: 413 nos dois cenários; corpo pequeno segue com 200
  - EVIDENCE: 3 testes verdes (`content-length` mentiroso incluído).

- [x] Controlo positivo: neutralizar os dois testes de teto (`if (false)`)
      deixa VERMELHO.
  - EVIDENCE: 2 falhas, ambas `AssertionError: expected 401 to be 413`.
    Restaurado.

---

## G4 — INT-001c: forward interno sem timeout

Local: `src/app/api/webhooks/n8n/route.ts:102-165` — 6 `fetch` sem `signal`.

- [x] Os 6 forwards passam por `forwardFetch`, que anexa
      `AbortSignal.timeout(30s)`.
  - CHECK: `grep -c "await forwardFetch(" src/app/api/webhooks/n8n/route.ts`
  - EXPECT: 6, e nenhum `await fetch(` restante
  - EVIDENCE: 6 ocorrências de `forwardFetch`, 0 de `await fetch(`.

- [x] Controlo positivo: remover o `signal` de `forwardFetch` deixa VERMELHO.
  - EVIDENCE: `AssertionError: expected "vi.fn()" to be called with arguments:
    [ …(2) ]`. Restaurado.

---

## G5 — INT-009: paginação Graph/OneDrive segue `nextLink` absoluto com Bearer

Locais: `src/lib/onedrive-graph.ts:7-9` e `src/lib/graph-mail-client.ts:123-131`
— ambos faziam `resourcePath.startsWith('http') ? resourcePath : BASE+path`.
São DOIS sítios independentes; os dois foram fechados.

- [x] `nextLink` para host que não é `graph.microsoft.com` é recusado ANTES do
      fetch — o token nunca sai. Caminho relativo segue funcionando.
  - CHECK: `npx vitest run src/lib/__tests__/http-allowlist.test.ts`
  - EXPECT: rejeita e `fetch` não é chamado
  - EVIDENCE: 4 testes no bloco INT-009 + 1 no bloco do cliente de e-mail;
    `expect(fetchMock).not.toHaveBeenCalled()` verde.

- [x] Controlo positivo (onedrive-graph): voltar ao ternário original deixa
      VERMELHO.
  - EVIDENCE: `expected [Function] to throw error matching /fora da allowlist/
    but got 'Cannot read properties of undefined'` — ou seja, a execução CHEGOU
    ao fetch. Restaurado.

- [x] Controlo positivo (graph-mail-client): voltar ao ternário original deixa
      VERMELHO, com o vazamento explícito.
  - EVIDENCE: `AssertionError: expected [Function] to throw error matching
    /fora da allowlist/ but got 'token vazou para https://attacker.test/next'`.
    Restaurado.

---

## G6 — INT-010: `baseUrl` da Receita é `z.string()` e vai com mTLS

Locais: `src/lib/schemas/receita.ts:12,23` (`z.string()`),
`src/lib/receita-nfse-client.ts:208-215` (cert+key do e-CNPJ no `https.request`).
Dois chamadores independentes: `src/app/api/receita/nfse/config/route.ts:195` e
`src/lib/receita-nfse-sync.ts:115` — cada um com a SUA cópia da resolução de
baseUrl, por isso a guarda foi posta no construtor, ponto único dos dois.

- [x] Host fora dos ADN oficiais lança na CONSTRUÇÃO, antes de qualquer
      handshake: o certificado da empresa nunca é apresentado.
  - CHECK: `npx vitest run src/lib/__tests__/receita-nfse-baseurl.test.ts`
  - EXPECT: aceita os 2 ADN; recusa host estranho, http://, loopback,
    metadados e string que não é URL
  - EVIDENCE: `Tests  8 passed (8)`

- [x] Schema de gravação recusa baseUrl fora do ADN, mantendo vazio/ausente
      como "usar o padrão do ambiente" (sem quebrar a configuração atual).
  - EVIDENCE: coberto pelos 2 últimos testes do ficheiro.

- [x] Controlo positivo: remover `assertAllowedHost` do construtor deixa
      VERMELHO.
  - EVIDENCE: 4 falhas, todas `AssertionError: expected [Function] to throw an
    error`. Restaurado.

---

## G7 — INT-011: `baseUrl` do n8n só valida `z.string().url()`

Local: `src/app/api/integrations/n8n/config/route.ts:17`.

- [x] Gravação exige https, sem credenciais na URL e sem IP privado/loopback,
      pela MESMA regra usada na hora de chamar (`resolveN8nHost`).
- [x] Egresso fica preso ao host gravado — a paginação por cursor não pode ser
      desviada. Endereço inválido vira ESTADO (`not_configured`), nunca exceção:
      `fetchN8nWorkflows` não pode lançar, por contrato do módulo.
  - CHECK: `npx vitest run src/lib/__tests__/n8n-baseurl-egress.test.ts`
  - EXPECT: 6 recusas sem chamar fetch + host preso no caminho feliz
  - EVIDENCE: `Tests  8 passed (8)`

- [x] Controlo positivo: devolver `hostname` cru em `resolveN8nHost` (sem
      `assertAllowedHost`) deixa VERMELHO.
  - EVIDENCE: 6 falhas, incl. `AssertionError: expected 'n8n.qlmed.com.br' to
    be null`. Restaurado.

---

## G8 — Controlos positivos registados

- [x] 12 reversões independentes, cada uma VERMELHA, cada uma restaurada, com o
      erro exato registado em G1–G7 e no relatório final.
  - EVIDENCE: suíte completa verde após TODAS as restaurações —
    `Test Files 100 passed | 3 skipped (103) / Tests 795 passed | 4 skipped (799)`.
  - Uma reversão NÃO reprovou à primeira (INT-006): o teste era inútil e foi
    refeito. Ver G10.

---

## G9 — INT-003: nonce HMAC é process-local

Local: `src/lib/n8n-webhook-security.ts:56-73` — `Map` em processo, com um
comentário `ponytail:` a admitir o teto. Com N réplicas a proteção valia 1/N.

- [x] Store partilhado no Postgres. `INSERT ... ON CONFLICT DO NOTHING` é a
      reivindicação atómica; a chave primária resolve a corrida no banco.
  - CHECK: `npx vitest run src/lib/__tests__/n8n-webhook-security.test.ts`
  - EXPECT: segunda réplica recusa; 8 concorrentes dão 1 vencedor
  - EVIDENCE: `Tests  6 passed (6)`

- [x] Prova de "dois processos": `vi.resetModules()` + reimport cria uma
      instância sem NENHUM estado em memória partilhado, e ela recusa.
- [x] Falha de banco RECUSA (fail-closed).
- [x] Controlo positivo: trocar `return inserted === 1` por `return true`
      (o que o Map fazia) deixa VERMELHO.
  - EVIDENCE: 3 falhas, incl. `expected [ true, true, true, true, true, ...(3) ]
    to have a length of 1 but got 8`. Restaurado.

**DDL para a folha L8** (não editei `prisma/schema.prisma` nem
`prisma/migrations/`, conforme o contrato). Diff do schema:

```prisma
model N8nWebhookNonce {
  nonce     String   @id
  expiresAt DateTime @db.Timestamptz

  @@index([expiresAt])
}
```

SQL equivalente:

```sql
CREATE TABLE "N8nWebhookNonce" (
    "nonce"     TEXT        NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "N8nWebhookNonce_pkey" PRIMARY KEY ("nonce")
);
CREATE INDEX "N8nWebhookNonce_expiresAt_idx" ON "N8nWebhookNonce"("expiresAt");
```

`@db.Timestamptz` é deliberado: o código compara `"expiresAt"` com um `Date`
ligado por parâmetro, e `timestamp` sem fuso faria a comparação depender do
`TimeZone` da sessão. **Ordenação: L8 tem de aplicar isto ANTES deste código
ir a produção** — sem a tabela, `consumeWebhookNonce` falha fechado e o
webhook devolve 401 em tudo.

---

## G10 — INT-006: action notify regista payload arbitrário

Local: `src/app/api/webhooks/n8n/route.ts:169` — `log.info({payload})`.

- [x] O payload não é entregue ao logger; só a contagem de chaves.
  - CHECK: `npx vitest run src/lib/__tests__/n8n-webhook-notify-log.test.ts`
  - EXPECT: nem chaves nem valores no que chega ao logger
  - EVIDENCE: `Tests  1 passed (1)`

- [x] Controlo positivo: repor `log.info({ payload })` deixa VERMELHO.
  - EVIDENCE: `AssertionError: expected '[{"payload":{"cpfDoPaciente":"9998887...'
    not to contain 'cpfDoPaciente'`. Restaurado.

- [x] **A primeira versão deste teste não protegia nada.** Espiava
      `process.stdout.write`, e passava COM e SEM a correção — o pino escreve
      no descritor por baixo. Descartada e refeita a observar a fronteira que a
      rota controla: o objeto passado ao logger. Só a segunda versão reprovou
      no controlo.

- [x] Fronteira com a L4: mexi apenas na linha do route.ts.
      `src/lib/logger.ts` não foi tocado — o `redact` global é da L4.

---

## G11 — INT-007: base64 do webhook não é estrito

Local: `src/app/api/webhooks/n8n/route.ts:119-132`.

- [x] Alfabeto base64 canónico exigido antes de `Buffer.from`, que é leniente
      e descarta silenciosamente o que não reconhece.
- [x] Teto do DECODIFICADO (5 MiB, espelha o `MAX_XML_SIZE` do
      `/api/invoices/upload`) além do teto do codificado.
  - CHECK: `npx vitest run src/lib/__tests__/n8n-webhook-edge.test.ts -t "INT-007"`
  - EXPECT: 7 MiB de zeros → 413; malformado → 400; válido pequeno → 200
  - EVIDENCE: `Tests  5 passed`

- [x] Controlo positivo: neutralizar as duas checagens deixa VERMELHO.
  - EVIDENCE: 4 falhas — `expected 200 to be 413` e `expected 200 to be 400`.
    Restaurado.

---

## G12 — INT-012: EVO_API_URL sem allowlist

Local: `src/lib/whatsapp-evolution.ts:29-68`.

- [x] `assertAllowedHost` (o contrato de G1) aplicado. Endereço inutilizável
      DESLIGA o canal em vez de lançar, como uma variável em falta
      (SPEC-031 FR-006) — lançar derrubaria o envio de uma nota por causa de
      configuração.
- [x] `redirect: 'error'`. O spec do fetch remove `Authorization`/`Cookie` num
      salto entre origens, mas NÃO um cabeçalho próprio como `apikey`: um 302
      levava a chave e o PDF juntos.
  - CHECK: `npx vitest run src/lib/__tests__/whatsapp-evolution-egress.test.ts`
  - EXPECT: `http://evil` recusado; 6 formas de endereço mau desligam o canal
  - EVIDENCE: `Tests  9 passed (9)`

- [x] Controlo positivo: neutralizar a checagem e remover `redirect` deixa
      VERMELHO.
  - EVIDENCE: 7 falhas, incl. `expected { baseUrl: 'http://evil', ...(2) } to be
    null`. Restaurado.

---

## G13 — INT-014: GET enumera actions com a master key

Local: `src/app/api/webhooks/n8n/route.ts:181-189`.

- [x] Handler GET removido. Sem export, o Next responde 405.
  - CHECK: `npx vitest run src/lib/__tests__/n8n-webhook-edge.test.ts -t "INT-014"`
  - EXPECT: o módulo não exporta GET
  - EVIDENCE: `Tests  1 passed`

- [x] Controlo positivo: repor o GET deixa VERMELHO.
  - EVIDENCE: `AssertionError: expected [AsyncFunction GET] to be undefined`.
    Restaurado.

---

## G14 — Portões finais

- [x] `npm run typecheck` verde. EVIDENCE: exit 0, sem diagnóstico.
- [x] `npm run lint` verde. EVIDENCE: exit 0, sem warnings.
- [x] `npm test` verde. EVIDENCE: `795 passed | 4 skipped (799)`, de `729`.
- [x] Commit na branch `fix/audit-l3-borda`, push para `origin`.
