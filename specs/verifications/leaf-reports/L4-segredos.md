# Gates — L4 segredos em repouso e observabilidade

Folha L4 da auditoria QLMED `b177b072b51ed09cd0212fb24c0760eace924441`.
Fecha 9 findings: FILE-007, OBS-001, OBS-003, OBS-004, OBS-005, PRIV-002,
FISCAL-009, FISCAL-010, FISCAL-011.

Baseline medido antes de qualquer edição (`npm test`, 2026-09-01):

```
Test Files  94 passed | 3 skipped (97)
     Tests  725 passed | 4 skipped (729)
```

Final medido:

```
Test Files  102 passed | 3 skipped (105)
     Tests  802 passed | 4 skipped (806)
```

Regra: só marcar `[x]` com evidência medida colada na caixa.

---

## G1 — FILE-007a: PFX cifrado em repouso ✅

- [x] `encryptPfx(pfx, cnpj)` devolve blob que **não contém** os bytes do PFX.
      `certificate-secret.test.ts`: `blob.includes(pfx) === false`, magic `QLMEDPFX1`.
- [x] Round-trip byte-a-byte: `Buffer.compare(decryptPfx(encryptPfx(p,c),c), p) === 0`.
- [x] Blob diferente a cada chamada (salt/iv aleatórios).
- [x] CTRL+ `pfxData: encryptedPfx` → `pfxData: buffer` na rota de upload:
      `AssertionError: expected false to be true` em
      "grava o pfxData cifrado, nunca os bytes do PFX". Restaurado, 7/7 verde.

## G2 — FILE-007b: decrypt fail-closed ✅

- [x] `decryptPfx` recusa blob sem magic, com erro que nomeia o script de migração.
- [x] `decrypt()` lança em vez de devolver o input.
- [x] CTRL+ restaurado `return encryptedText`:
      `3 failed | 7 passed` — `AssertionError: expected [Function] to throw an error` (×3).

## G3 — FILE-007c: vínculo com o CNPJ ✅

- [x] Blob do CNPJ A não decifra com o CNPJ B (falha de AAD do GCM).
- [x] Upload recusa 400 quando CNPJ do certificado ≠ CNPJ da empresa.
- [x] Upload recusa 400 quando não dá para ler o CNPJ do certificado.
- [x] Upload recusa 400 certificado vencido; recusa ambiente fora do enum.
- [x] CTRL+ `if (certCnpj !== companyCnpj)` → `if (false)`:
      `AssertionError: expected 200 to be 400`.

## G4 — FILE-007d: caminho de migração das linhas em claro ✅

- [x] `migratePlaintextPfx(db)` cifra a linha em claro sem perder um byte —
      round-trip provado contra os bytes originais antes do `update`.
- [x] Idempotente: 2ª passagem → `{encrypted: 0, alreadyEncrypted: 1}`, 0 updates.
- [x] Linha sem empresa fica **intacta** e é reportada em `failed` — nunca ilegível.
- [x] Multi-empresa: cada blob só abre com o próprio CNPJ.
- [x] `scripts/migrate-plaintext-secrets.ts` (simulação por omissão, `--apply` grava).

## G5 — OBS-001: Pino com redact ✅

- [x] Ausência medida: `log.info({payload:{xml:SEGREDO}})` e a saída **não contém**
      a string do segredo. 18 casos, incluindo aninhamento de 2 níveis e
      `req.headers.authorization`.
- [x] Campos não sensíveis continuam legíveis.
- [x] CTRL+ `redact` removido: `17 failed | 1 passed`, com o payload visível na
      saída — `"payload":{"xml":"S3GR3D0-QUE-NAO-PODE-VAZAR"}`.

## G6 — OBS-003: health público sem SHA ✅

- [x] Sem sessão: `build === undefined`, `db.latencyMs === undefined`, e o SHA
      não aparece no JSON serializado. `status` e `db.status` continuam lá.
- [x] Autenticado: `build.commitSha` e `db.latencyMs` presentes.
- [x] CTRL+ `build` devolvido ao ramo público:
      `AssertionError: expected { …(4) } to be undefined`.

## G7 — OBS-004: relatório com timeout e origem pinada ✅

- [x] `AbortSignal.timeout(30_000)` no fetch interno.
- [x] Origem só de `NEXTAUTH_URL`; `Host` hostil ignorado; sem `NEXTAUTH_URL`
      a rota falha em vez de adivinhar.
- [x] CTRL+ restaurado `|| req.nextUrl.origin` e removido o signal:
      `expected undefined to be an instance of AbortSignal` e
      `expected 200 to be greater than or equal to 500`.
- [x] `src/lib/pdf/render.ts` NÃO tocado (é da folha L5) — `git diff` vazio.

## G8 — OBS-005: CSP sem unsafe-inline em script-src ❌ NÃO FECHADO

- [ ] script-src de produção sem `'unsafe-inline'`.
- [ ] Verificação em browser de que a app ainda renderiza sob a nova policy.

Bloqueio, medido e não contornado:

1. Nonce do Next exige emitir o header no **middleware**. O matcher atual
   (`src/middleware.ts`) não cobre `/`, `/login`, `/sobre`, `/register`, `/r`,
   `/auth` — justamente as páginas públicas. Estendê-lo obriga a mexer na
   lógica de auth do middleware (sem early-return, `/login` entra em loop de
   redirect). Isso é território de outra folha e é o caminho para derrubar o
   login inteiro.
2. Nonce força renderização dinâmica em todas as páginas. Medido no
   `npm run build` desta branch: **26 páginas hoje são estáticas (`○`)** contra
   3 já dinâmicas (`ƒ`). O nonce converte as 26 — custo que o dono não pediu e
   que não cabe decidir aqui.
3. O gate exige prova em browser. Não tenho como abrir a app autenticada aqui,
   então marcar isto como fechado seria afirmar o que não medi.

Medido a favor de quem for fechar: **a app não tem nenhum script inline
próprio** — `grep -rn "dangerouslySetInnerHTML\|<script" src/app` não retorna
nada. Os únicos inline são os do runtime do Next, que recebem o nonce
automaticamente. O beacon do Cloudflare é `<script src=...>` externo, liberado
por host e não por `unsafe-inline`, então **não quebra** ao remover o
`unsafe-inline`. O trabalho que resta é o matcher do middleware + a verificação
em browser.

## G9 — PRIV-002: AccessLog no download de PDF clínico ✅

- [x] IMPCG e CASSEMS (caller irmão) gravam AccessLog com o `userId` do
      requisitante e `path` com o id do ofício.
- [x] `Cache-Control` passou a `private, no-store`.
- [x] Conexão OneDrive **nomeada**: o fallback "qualquer conexão da empresa"
      saiu; sem a caixa nomeada devolve 404.
- [x] Falha ao gravar a trilha não derruba o download; ofício inexistente não
      gera trilha.
- [x] CTRL+ escrita do AccessLog removida:
      `expected "vi.fn()" to be called 1 times, but got 0 times`.
- [ ] Ação dedicada `impcg_pdf_read` / `cassems_pdf_read`: exige alterar o enum
      `AccessLogAction` em `prisma/schema.prisma` — fora do meu contrato.
      Usei `navigation` com o `path` descritivo (precedente de `users/[id]`).
      SQL e diff para a L8 estão no relatório.

## G10 — FISCAL-009: matching de revenda unificado ✅

- [x] `src/lib/product-aggregation/resale-match.ts` é a única fonte das chaves;
      `aggregate.ts` (rebuild) e `product-aggregate-updater.ts` (incremental)
      importam o mesmo símbolo.
- [x] Ordem de sonda pinada: código → código-na-descrição → EAN → descrição.
- [x] Delta = 0 entre incremental e rebuild sobre a mesma fixture.
- [x] Integração: a linha que só casa por EAN e a que só casa por descrição
      passam a ser deduzidas (antes: `continue` silencioso).
- [x] `updateSaleDate` (caller irmão, mesmo defeito) também unificado.
- [x] CTRL+ incremental de volta ao `buildProductKey` exato:
      `expected +0 to be 3` (EAN) e `expected +0 to be 2` (descrição) — as duas
      linhas voltam a ser ignoradas. (O 3º caso do arquivo também falha, mas
      por limitação do cliente falso, que só resolve `where.id`.)

## G11 — FISCAL-010: ambiente fail-closed ✅

- [x] `'homologacao'`, `'prod'`, `'hom'`, `'HOMOLOGATION'`, `'sandbox'` → lança.
- [x] `null`/`undefined`/`''` continuam production (default do schema, intencional).
- [x] Teste que afirmava `'prod' → 'production'` substituído: protegia o defeito.
- [x] `distDfeIsProduction(certEnvironment)` loga explicitamente a divergência.
- [x] CTRL+ ternário restaurado: `5 failed`,
      `AssertionError: expected [Function] to throw an error`.

## G12 — FISCAL-011: signedXml limpo ao voltar para draft ✅

- [x] PATCH grava `signedXml: null` e `protocolXml: null` junto com
      `number: null` / `accessKey: null`.
- [x] Nem GET nem PATCH devolvem o XML assinado no corpo.
- [x] CTRL+ os dois campos removidos do `data`:
      `AssertionError: expected undefined to be null`.

## G13 — Portões do repositório ✅

- [x] `npm run typecheck` verde.
- [x] `npm run lint` verde.
- [x] `npm test`: 802 passed | 4 skipped (806). Baseline 725/729 → +77 testes.
- [x] `npm run build` (produção) verde.
- [x] Nenhum arquivo fora do escopo tocado: `src/lib/auth.ts`,
      `prisma/schema.prisma`, `prisma/migrations/`, `.github/workflows/`,
      `src/lib/pdf/render.ts` (L5), `src/app/api/webhooks/n8n/route.ts` (L3).
- [x] Branch `fix/audit-l4-segredos` empurrada para `origin`.

ABANDON: OBS-005-csp-nonce O nonce do Next exige estender o matcher do
middleware para `/`, `/login`, `/sobre`, `/register`, `/r` e `/auth`, o que
esbarra na lógica de auth (sem early-return, `/login` entra em loop de
redirect), e converte 26 páginas hoje estáticas em dinâmicas — medido no build
desta branch: 26 estáticas contra 3 dinâmicas. O gate ainda pede prova em
browser, que não é executável neste ambiente. O que a folha MEDIU e que reduz o
custo de quem fechar: a app não tem script inline próprio
(`grep -rn "dangerouslySetInnerHTML|<script" src/app` vazio), e o beacon do
Cloudflare é `<script src=...>` externo, liberado por host — não quebra ao
remover o `unsafe-inline`. Falta só o matcher e a verificação em browser.

ABANDON: PRIV-002-enum-dedicado A ação do AccessLog ficou `navigation` com
`path` descritivo, seguindo o precedente já comentado em
`src/app/api/users/[id]/route.ts`. Ações dedicadas `impcg_pdf_read` e
`cassems_pdf_read` exigem `ALTER TYPE ... ADD VALUE`, que não roda dentro de
bloco de transação no Postgres e portanto precisa de migração desenhada com
cuidado — schema é da folha L8, que já entregou. O invariante do finding
(acesso a ofício é atribuível a um utilizador) ESTÁ fechado; o que fica é
granularidade de consulta, não rastreabilidade.
