# Gate L2 — ACL default-deny (auditoria b177b07)

Alvo: `b177b07`. Branch: `fix/audit-l2-acl`.

> **Nota de contrato.** `specs/leaf-briefs/L2-acl.md` e `PLAN.md` não existiam no
> worktree no arranque. O trabalho começou a partir do enunciado + leitura direta
> de `src/middleware.ts`, `src/lib/navigation.ts`, `src/lib/auth.ts` e das 109
> rotas de `src/app/api`; o brief chegou depois, por correção do coordenador, e
> G13–G16 são os achados que só o brief traz (AUTH-008, 009, 012 e o backfill
> exigido pelo AUTH-005). Nada foi escrito em `prisma/schema.prisma`,
> `prisma/migrations/`, `.github/workflows/` ou `src/lib/logger.ts`.
>
> Mapa brief → gate: AUTH-001 G5 · AUTH-002 G6 · AUTH-003 G7 · AUTH-004 G8 ·
> AUTH-005 G1+G10+G11+G16 · AUTH-006 G4 · AUTH-007 G9+G15 · AUTH-008 G14 ·
> AUTH-009 G13 · AUTH-012 G17 · AUTH-013 G2 · AUTH-014 G2.

## Linha de base medida (antes de qualquer edição)

```
CHECK: npm test
EXPECT: exit 0
EVIDENCE: exit 0
          Test Files  94 passed | 3 skipped (97)
          Tests  725 passed | 4 skipped (729)
          Duration  6.35s
```

---

## G1 — AUTH-005: `allowedPages=[]` deixa de significar acesso total

`canAccessPage`/`canAccessApi` em `src/lib/navigation.ts` tratavam lista vazia ou
`undefined` como "usuário legado, libera tudo". Passa a negar.

- [x] `canAccessPage(role!=admin, [], qualquer)` → `false`
- [x] `canAccessApi(role!=admin, [], qualquer)` → `false`
- [x] `/api/users/me/*` continua acessível a qualquer sessão ativa (self-service)

```
CHECK: npx vitest run src/lib/__tests__/navigation.test.ts src/lib/__tests__/acl-default-deny.test.ts
EXPECT: exit 0
EVIDENCE: Test Files 2 passed (2) / Tests 32 passed (32)
          navigation.test.ts: "empty allowedPages grants full access (legacy users)"
          reescrito para "empty allowedPages grants nothing"
```

Controlo positivo (canAccessPage):
```
CHECK: `if (!allowedPages || allowedPages.length === 0) return false;` → `return true;`
EXPECT: VERMELHO
EVIDENCE: × nega páginas para lista vazia ou ausente 4ms
          AssertionError: expected true to be false // Object.is equality
          Tests  1 failed | 17 passed (18)
```

Controlo positivo (canAccessApi):
```
CHECK: mesma reversão no ramo de canAccessApi
EXPECT: VERMELHO
EVIDENCE: × nega APIs page-gated para lista vazia ou ausente 4ms
          AssertionError: expected true to be false // Object.is equality
          Tests  1 failed | 17 passed (18)
```

---

## G2 — Prefixo de API não mapeado nega em vez de liberar

`requiredPagesForApi` devolve `[]` para prefixo desconhecido e `canAccessApi`
lia esse `[]` como "não é page-gated → libera". Prefixos que estavam sem mapa:
`/api/admin`, `/api/integrations`, `/api/notification-clicks`,
`/api/notifications`, `/api/register`, `/api/webhooks`.

- [x] prefixo desconhecido → `false` para não-admin
- [x] `/api/integrations` mapeado para `/sistema/automacoes`
- [x] `/api/health`, `/api/auth`, `/api/users/me` isentos por lista explícita
      (`UNGATED_API_PREFIXES`), não por ausência de mapa

```
CHECK: npx vitest run src/lib/__tests__/acl-default-deny.test.ts
EXPECT: exit 0
EVIDENCE: Test Files 1 passed (1) / Tests 18 passed (18)
```

Controlo positivo:
```
CHECK: `if (required.length === 0) return false;` → `return true;`
EXPECT: VERMELHO
EVIDENCE: × nega /api/admin/api-keys para um não-admin com páginas concedidas
          × nega /api/notification-clicks para um não-admin com páginas concedidas
          × nega /api/notifications/outbox/claim para um não-admin com páginas concedidas
          × nega /api/webhooks/n8n para um não-admin com páginas concedidas
          × nega /api/rota-que-alguem-vai-criar-amanha para um não-admin com páginas concedidas
          AssertionError: expected true to be false // Object.is equality
          Tests  5 failed | 13 passed (18)
```

---

## G3 — Página de painel não mapeada nega em vez de liberar

`resolvePanelPagePath` devolvia `null` para `/cadastro/anvisa` e
`/sistema/companies` (existem em `src/app/(painel)` e não em `PAGE_GROUPS`);
com `null` o middleware pulava a checagem inteira.

- [x] `/cadastro/anvisa` resolve para `/cadastro/produtos`
- [x] `/sistema/companies` resolve para `/sistema/settings`
- [x] caminho de painel desconhecido → nega (o middleware passa o pathname cru,
      que nunca está em `allowedPages`)

```
CHECK: npx vitest run src/lib/__tests__/acl-default-deny.test.ts
EXPECT: exit 0
EVIDENCE: Test Files 1 passed (1) / Tests 18 passed (18)
```

Controlo positivo:
```
CHECK: remover as duas entradas de PANEL_PAGE_ALIASES
EXPECT: VERMELHO
EVIDENCE: × resolve os aliases em vez de devolver null (que virava fail-open)
          × todo caminho de painel real resolve para uma página existente
          AssertionError: expected null to be '/cadastro/produtos' // Object.is equality
          AssertionError: expected null not to be null
          Tests  2 failed | 16 passed (18)
```

---

## G4 — AUTH-006: remover o caminho legado `QLMED_API_KEY` → escopo admin

`getApiKeyContext` comparava o header com `process.env.QLMED_API_KEY` e devolvia
`scopes: ['admin']` amarrado ao primeiro admin ativo do banco.

- [x] bloco de fallback removido de `src/lib/auth.ts` (e `safeEqual`, que ficou morto)
- [x] `QLMED_API_KEY` não aparece mais em `src/lib/auth.ts`
- [x] comentário obsoleto sobre `apikey-legacy-001` removido — nunca houve
      semente com esse id; o código devolvia `keyId: 'legacy-env'`

```
CHECK: grep -c QLMED_API_KEY src/lib/auth.ts
EXPECT: 0
EVIDENCE: 0
```

Controlo positivo:
```
CHECK: restaurar o bloco de fallback em getApiKeyContext
EXPECT: VERMELHO
EVIDENCE: × a chave do ambiente não resolve contexto nenhum 146ms
          × não procura um admin no banco para lhe emprestar a identidade 2ms
          × requireApiKeyScope recusa a chave do ambiente 9ms
          AssertionError: expected { keyId: 'legacy-env', …(2) } to be null
          AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
          AssertionError: promise resolved "{ keyId: 'legacy-env', …(2) }" instead of rejecting
          Tests  3 failed | 15 passed (18)
```

---

## G5 — AUTH-001: export XML decidia sem `companyId`

`src/app/api/invoices/export-xml/route.ts` fazia `invoice.count` e
`invoice.findMany` sem `companyId`.

- [x] as duas queries filtram por `companyId` (um só `invoiceFilter` partilhado)

```
CHECK: grep -c companyId src/app/api/invoices/export-xml/route.ts
EXPECT: >= 2
EVIDENCE: 2
```
```
CHECK: npx vitest run src/lib/__tests__/acl-company-scope.test.ts
EXPECT: exit 0 — o teste lê o `where` que chega ao Prisma, não o texto do ficheiro
EVIDENCE: Test Files 1 passed (1) / Tests 5 passed (5)
```

Controlo positivo:
```
CHECK: remover `companyId: company.id` do invoiceFilter
EXPECT: VERMELHO
EVIDENCE: × conta e pagina apenas as notas da empresa do chamador 150ms
          AssertionError: expected undefined to be 'company-1' // Object.is equality
          Tests  1 failed | 4 passed (5)
```

---

## G6 — AUTH-002: ANVISA decidia sem `companyId`

`src/app/api/anvisa/validate/route.ts` lia `productRegistry.findFirst` /
`findMany` e escrevia `update` sem `companyId`. Qualquer sessão validava um
código e reescrevia as linhas de registo de outra empresa.

- [x] leitura de cache filtra por `companyId`
- [x] escrita de sincronização filtra por `companyId`

```
CHECK: grep -c "company.id" src/app/api/anvisa/validate/route.ts
EXPECT: >= 2
EVIDENCE: 2
```

Controlo positivo:
```
CHECK: remover companyId do findFirst e do findMany
EXPECT: VERMELHO
EVIDENCE: × lê o cache só dentro da empresa do chamador 12ms
          × só reescreve linhas da empresa do chamador ao sincronizar 1ms
          AssertionError: expected undefined to be 'company-1' // Object.is equality (x2)
          Tests  2 failed | 3 passed (5)
```

---

## G7 — AUTH-003: cancelamento decidia sem `companyId`

`applyNfeCancellation` fazia `invoice.updateMany({ where: { accessKey, cancelledAt: null } })`.
A chave de acesso vem de XML/provedor externo.

- [x] `companyId` vira parâmetro **obrigatório** — o `tsc` apontou exactamente os
      5 chamadores (sefaz x2, nsdocs, import-period x2, apply-event-xml)
- [x] `updateMany` filtra por `companyId`

```
CHECK: npx vitest run src/lib/__tests__/nfe-cancellation.test.ts src/lib/__tests__/local-xml-event-cancel.test.ts
EXPECT: exit 0
EVIDENCE: Test Files 2 passed (2) / Tests 20 passed (20)
```

Controlo positivo:
```
CHECK: remover `companyId: input.companyId` do where e a guarda `!input.companyId`
EXPECT: VERMELHO
EVIDENCE: × marca a nota existente a partir do XML de evento no nome do arquivo 16ms
          × marca cancelledAt na nota existente sem sobrescrever xmlContent 8ms
          × nao aplica cancelamento sem companyId 2ms
          AssertionError: expected { …(2) } to deeply equal { companyId: 'company-1', …(2) }
          AssertionError: expected true to be false // Object.is equality
          Tests  3 failed | 17 passed (20)
```

---

## G8 — AUTH-004: import caía em `findFirst` quando o CNPJ canónico faltava

`getTargetCompany` em `src/lib/local-xml-sync/file-import.ts` fazia
`company.findFirst({ orderBy: { createdAt: 'asc' } })` e importava XML fiscal
para a empresa errada, com um `log.warn` como único sinal.

- [x] fallback removido; sem a empresa canónica devolve `null` e pausa a importação

```
CHECK: grep -c "company.findFirst" src/lib/local-xml-sync/file-import.ts
EXPECT: 0   (o CHECK original dizia "findFirst" solto e teria contado o
             invoice.findFirst da linha 281, que não tem relação — corrigido)
EVIDENCE: 0
```

Controlo positivo:
```
CHECK: restaurar o `company.findFirst({ orderBy: { createdAt: 'asc' } })`
EXPECT: VERMELHO
EVIDENCE: × pausa em vez de escolher a primeira empresa do banco 7ms
          AssertionError: expected { id: 'outra-empresa', …(1) } to be null
          Tests  1 failed | 4 passed (5)
```

---

## G9 — AUTH-007: o portão de guardas era um regex sobre o texto do ficheiro

`src/lib/__tests__/api-route-guards.test.ts` aceitava o ficheiro inteiro se
QUALQUER trecho casasse o regex — inclusive o `import { requireAdmin }` do topo.

- [x] comentários de bloco e de linha são removidos antes do casamento
- [x] a verificação é por handler HTTP exportado, não por ficheiro
- [x] guarda alcançada por auxiliar do próprio módulo conta (padrão
      `sessionUserId()` de `users/me/*`), resolvida por ponto fixo
- [x] as 109 rotas continuam a passar — nenhum handler real ficou a descoberto

```
CHECK: npx vitest run src/lib/__tests__/api-route-guards.test.ts
EXPECT: exit 0
EVIDENCE: Test Files 1 passed (1) / Tests 6 passed (6)
```

Controlo positivo — comentar `await requireAdmin()` em `src/app/api/users/route.ts:13`:
```
CHECK: teste NOVO contra a guarda comentada
EXPECT: VERMELHO
EVIDENCE: × guards EVERY exported HTTP handler, not just the file as a whole 14ms
          AssertionError: expected [ 'src/app/api/users/route.ts#GET' ] to deeply equal []
          Tests  1 failed | 5 passed (6)
```
```
CHECK: teste ANTIGO (git show HEAD:src/lib/__tests__/api-route-guards.test.ts)
       contra a MESMA guarda comentada
EXPECT: demonstra o buraco — devia falhar e não falha
EVIDENCE: Tests  1 passed (1)
          O portão antigo aprovava a listagem de utilizadores SEM autenticação
          nenhuma, porque o import `requireAdmin` no topo já casava o regex.
```

O detector traz 4 testes próprios (controlo positivo permanente): guarda só em
comentário, método irmão sem guarda, guarda via auxiliar local, e argumento
`{ params }` desestruturado — este último foi um falso positivo real durante a
construção, que dava 37 handlers "sem guarda" onde havia 0.

---

## G10 — O produtor do `[]`: a tela de utilizadores

`src/app/(painel)/sistema/usuarios/page-client.tsx` gravava
`allowedPages: allPagesChecked ? [] : selectedPages`. Com o default-deny, "Todas
as páginas" passaria a significar "nenhuma página" — o guarda mudaria e o
produtor continuaria a emitir o valor antigo.

- [x] "Todas as páginas" grava a lista explícita de `ALL_PAGES`
- [x] ao abrir, "todas" fica marcado quando a lista cobre `ALL_PAGES`
- [x] a validação "selecione pelo menos uma página" passa a olhar sempre
      `selectedPages`

```
CHECK: grep -n "allowedPages:" "src/app/(painel)/sistema/usuarios/page-client.tsx"
EXPECT: o corpo do PATCH manda `selectedPages`, nunca `[]`
EVIDENCE: 291:          allowedPages: selectedPages,
          (era `allowedPages: allPagesChecked ? [] : selectedPages`)
```

---

## G11 — O espelho do fail-open na barra lateral

`src/components/SidebarNav.tsx` repetia `allowedPages.length === 0 || ...`.

- [x] cláusula de lista vazia removida

```
CHECK: grep -c "allowedPages.length === 0" src/components/SidebarNav.tsx
EXPECT: 0
EVIDENCE: 0
```

---

## G12 — Fecho: typecheck, lint, testes

- [x] typecheck, lint e testes verdes com todas as correções aplicadas

```
CHECK: npm run typecheck
EXPECT: exit 0
EVIDENCE: exit 0, sem diagnóstico
```
```
CHECK: npm run lint
EXPECT: exit 0
EVIDENCE: exit 0, sem diagnóstico
```
```
CHECK: npm test
EXPECT: exit 0, contagem >= 729
EVIDENCE: Test Files  96 passed | 3 skipped (99)
          Tests  764 passed | 4 skipped (768)
          (linha de base: 94 ficheiros / 725 testes — +2 ficheiros, +39 testes)
```

---

## G13 — AUTH-009: o IP do rate limit vinha do ÚLTIMO X-Forwarded-For

`getClientIp` em `src/middleware.ts` pegava `ips.at(-1)` e nunca lia
`CF-Connecting-IP`. Sem proxy a acrescentar nada, esse último elemento é
inteiramente escolhido pelo cliente: rodar o header dava um balde novo a cada
tentativa de login.

- [x] `CF-Connecting-IP` primeiro (a Cloudflare descarta o valor do cliente)
- [x] `X-Forwarded-For` contado por `TRUST_PROXY_HOPS` **a partir da direita**,
      default 1 (preserva o comportamento actual atrás de um proxy)
- [x] cadeia mais curta do que os saltos declarados → não é aceite
- [x] `TRUST_PROXY_HEADERS=false` recusa também o `CF-Connecting-IP`

```
CHECK: npx vitest run src/lib/__tests__/rate-limit.test.ts
EXPECT: exit 0
EVIDENCE: Tests  8 passed (8)   (era 4)
```

Controlo positivo:
```
CHECK: remover o ramo do CF-Connecting-IP
EXPECT: VERMELHO
EVIDENCE: × prefere CF-Connecting-IP, que a Cloudflare reescreve e o cliente não forja 4ms
          AssertionError: expected '10.0.0.2' to be '198.51.100.77' // Object.is equality
          Tests  1 failed | 7 passed (8)
```

---

## G14 — AUTH-008: rate limit é um `Map` do processo

Um store partilhado exige tabela em Postgres, logo migração de schema — proibida
pelo contrato. Tomada a **outra** opção que o brief autoriza: documentar a
suposição de instância única, explicitamente e com gatilho de remediação.

- [x] teto nomeado no topo de `src/lib/rate-limit.ts` (N instâncias = N x limite,
      contador zera em cada deploy)
- [x] aceitação de risco registada em `SECURITY.md`
      (`QLMED-RISK-2026-09-RATELIMIT-INPROC`), com gatilho: migrar antes de
      passar a mais de um processo
- [x] ADR-0012 anotada: o limite é por IP e global, nunca por identidade, para
      que ninguém tranque o operador de fora
- [ ] **NÃO fechado:** store partilhado em Postgres — exige migração

```
CHECK: grep -c "QLMED-RISK-2026-09-RATELIMIT-INPROC" SECURITY.md
EXPECT: 1
EVIDENCE: 1
```

---

## G15 — AUTH-007 (segunda metade): negativos HTTP reais nas rotas P0

O portão estático do G9 prova que cada handler CITA uma guarda. Estes provam que
a guarda decide mesmo o código de resposta.

- [x] `export-xml`: 401 sem sessão, 403 sem papel, e o Prisma não é tocado
- [x] `invoices/[id]`: 401 sem sessão, sem resolver a empresa

```
CHECK: npx vitest run src/lib/__tests__/acl-company-scope.test.ts
EXPECT: exit 0
EVIDENCE: Tests  7 passed (7)
```

Controlo positivo pedido pelo brief:
```
CHECK: trocar `({ userId } = await requireEditor())` por `userId = "user-1"` em export-xml
EXPECT: VERMELHO
EVIDENCE: × export-xml devolve 401 sem sessão e 403 sem papel 4ms
          AssertionError: expected 200 to be 401 // Object.is equality
          Tests  1 failed | 6 passed (7)
```

---

## G16 — AUTH-005: o backfill, sem o qual a correção tranca os operadores

O default do schema é `[]` e continua a ser — para um utilizador NOVO,
"nada concedido" é a resposta certa. O acervo é que precisa de conversão.

- [x] `scripts/backfill-allowed-pages.ts`: converte `[]` na lista explícita de
      `ALL_PAGES` para os não-admin (admins são isentos pelo papel)
- [x] `--dry-run` relata sem gravar
- [x] schema **não** tocado — é script, não migração

```
CHECK: npm run typecheck
EXPECT: exit 0 (o script entra no tsconfig)
EVIDENCE: exit 0, sem diagnóstico
```

---

## G17 — AUTH-012: logout-everywhere atrasava até 5 min

O callback `jwt` só relia o banco depois de 5 min (`staleMs`). O middleware do
Edge não fala com o banco — só confere que `tokenVersion` é numérica. Resultado:
as rotas de API fechavam na hora e as PÁGINAS do painel continuavam abertas.

- [x] a janela de frescura foi removida: revalida em toda passagem
- [x] a divergência de `tokenVersion` continua a esvaziar o token (sem rebind)

```
CHECK: npx vitest run src/lib/__tests__/auth-options.test.ts
EXPECT: exit 0
EVIDENCE: Tests  17 passed (17)   (era 16; o teste
          "does not refresh a recent token with complete claims" travava
          exactamente o comportamento defeituoso e foi reescrito)
```

Controlo positivo:
```
CHECK: restaurar `staleMs = 5 * 60 * 1000` e o `needsRefresh`
EXPECT: VERMELHO
EVIDENCE: × revalidates tokenVersion against the DB on EVERY pass, even for a fresh token 2ms
          × expels a fresh token the instant tokenVersion is bumped in the DB 3ms
          AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
          AssertionError: expected { id: 'user-1', role: 'viewer', …(4) } to deeply equal {}
          Tests  2 failed | 15 passed (17)
```

---

## Fora do contrato — não editado, apenas registado

- **Dados existentes:** resolvido por `scripts/backfill-allowed-pages.ts` (G16),
  não por migração. **Tem de correr no deploy, antes de servir tráfego**, senão
  todo não-admin com `allowedPages = []` perde o painel inteiro.
- **AUTH-001, prefixo de empresa no caminho do XML — NÃO feito.** O brief pede
  `saveXmlToFile` com `companyId` no caminho. A parte explorável (o `count` e o
  `findMany` sem `companyId`) está fechada. O prefixo no caminho muda a
  disposição em disco de `xml_backup/<mês>/` para `xml_backup/<empresa>/<mês>/`,
  o que órfã todo ficheiro já gravado e quebra o leitor de `local-xml-sync`, que
  varre essas mesmas pastas — exige migração do sistema de ficheiros, não uma
  mudança de código. Vale notar que a chave de acesso da NF-e é única
  nacionalmente e embute o CNPJ do emitente, logo duas empresas não colidem no
  mesmo nome de ficheiro: o ganho seria defesa em profundidade, não a correção
  de uma fuga. Fica para uma folha que possa mexer no acervo em disco.
- **AUTH-006, o que a L3 precisa de ajustar.** Fiz só a minha parte, em
  `src/lib/auth.ts`: o fallback `QLMED_API_KEY` → `scopes:['admin']` saiu.
  **Não toquei em `src/app/api/webhooks/n8n/route.ts`** — é da L3 (HMAC
  fail-closed). O que sobra para a L3: aquela rota ainda tem o seu próprio
  `validateApiKey` comparando com a MESMA `process.env.QLMED_API_KEY`, e
  `getApiKey()` reencaminha essa chave para chamadas internas. Enquanto isso
  existir, a chave de ambiente continua a ser um segredo partilhado com poder de
  webhook; devia passar a uma linha de `ApiKey` com escopo mínimo.
  **Quebra operacional já causada por esta folha:** quem hoje bate em
  `/api/notifications/outbox/*` e `/api/cte/*` com a chave de ambiente
  (`scripts/notification-outbox-worker.py`, `ops/scripts/qlmed-cte-dist-sync.js`,
  `ops/compose/*.env.enc`) deixa de autenticar e precisa de uma linha real em
  `ApiKey`, emitida por `/api/admin/api-keys`, com o escopo devido.
- **AUTH-008:** store partilhado exige migração; ficou aceite e documentado (G14).
- **Aparato morto.** O middleware grava `x-qlmed-request-path` e
  `x-qlmed-request-method` em toda passagem com `x-api-key`, e nenhum consumidor
  lê esses cabeçalhos. Não removido: fora do escopo desta folha.

ABANDON: AUTH-008-store-partilhado Rate limit de login continua in-process. Um
store partilhado exige tabela nova, e o contrato do fan-out deu o schema à folha
L8 — a L2 não podia criar migração. Não é impossível de fazer, é impossível de
fazer DENTRO desta folha, e fechar por fora agora significaria mexer no schema
sem os testes de concorrência que o caso pede. Fica aceite e documentado em
SECURITY.md como QLMED-RISK-2026-09-RATELIMIT-INPROC, com gatilho de remediação.
Consequência real hoje: com uma réplica só, o limite funciona; ao escalar
horizontalmente, cada réplica conta o seu próprio balde.
