# Gates: R4 — bordas de autenticação (re-auditoria adversarial)

Base: `origin/audit/remediacao-b177b07` @ 1ad4007 · branch `fix/reaudit-r4`

Superfície: `src/lib/auth-options.ts`, `src/app/api/health/route.ts`,
`src/app/r/[deliveryId]/route.ts`, `src/lib/rate-limit.ts`, testes deles e
testes novos. `src/middleware.ts` não foi tocado (nem o `matcher`, ver G4).

---

- [x] **G0 — Base verde antes**
  CHECK: npx vitest run
  EXPECT: exit 0; contagem registada para comparar no fim
  EVIDENCE: `Test Files 137 passed | 4 skipped (141)`, `Tests 1175 passed | 9 skipped (1184)`, **`Errors 4 errors`, exit 1** — os 4 são `Cannot find package 'jsdom'`: o `node_modules` do worktree estava vazio (só `.vite`) e a resolução caía no `node_modules` do checkout principal, sem jsdom. Ambiente, não código. Um segundo `npm ci` no worktree instalou 744 pacotes (`ls node_modules | wc -l` = 573, com `jsdom`, `vitest`, `bcryptjs`) e os 4 erros desapareceram em G7.

- [x] **G1 — REAUD-B-06: negativo HTTP real em TODAS as rotas de /api/users, /api/admin, /api/integrations**
  `/api/sistema` não existe no repositório (`ls src/app/api` — sem `sistema`).
  9 ficheiros de rota, 15 handlers. Cada handler é chamado de verdade com o
  guarda REAL (`@/lib/auth` não é mockado — só `next-auth.getServerSession`,
  `next/headers` e o Prisma). Sem sessão → 401 nos 15; sessão de viewer → 403
  nos 9 handlers de admin. Em todos, nenhum modelo de dados foi tocado.
  CHECK: npx vitest run src/lib/__tests__/reaudit-r4-route-negatives.test.ts
  EXPECT: exit 0; 24 casos (15 anónimos + 9 viewer) + 1 controlo de sensibilidade (admin → 200)
  EVIDENCE: `reaudit-r4-route-negatives.test.ts (25 tests)` verde dentro da corrida de 4 ficheiros: `Test Files 4 passed (4)`, `Tests 50 passed (50)`.

- [x] **G1c — Controlo positivo de G1**
  Trocar em `GET /api/users` o `catch` que devolve 401/403 por `catch {}`.
  CHECK: npx vitest run src/lib/__tests__/reaudit-r4-route-negatives.test.ts src/lib/__tests__/api-route-guards.test.ts
  EXPECT: o novo teste VERMELHO (GET /api/users viewer → não 403); api-route-guards continua verde (é essa a cegueira que o achado descreve)
  EVIDENCE: `sed -i '14,17c\    } catch {}'` na rota; saída: `reaudit-r4-route-negatives.test.ts (24 tests | 2 failed)` — `× 'GET /api/users'` ×2, `AssertionError: expected 200 to be 401` e `expected 200 to be 403`; `Test Files 1 failed | 1 passed (2)` — o ficheiro que passou é o `api-route-guards`, verde com o buraco aberto. Restaurado por cópia; `cmp` contra o original: `users route = original (não tocado)`.

- [x] **G2 — REAUD-B-17: `jwt` falha fechado quando o banco lança**
  `catch` devolve `{}` como no ramo de mismatch.
  CHECK: npx vitest run src/lib/__tests__/auth-options.test.ts
  EXPECT: exit 0; teste novo "findUnique rejeita → token sem role" verde
  EVIDENCE: 18 testes verdes (17 + 1 novo) na corrida de 4 ficheiros (`50 passed`).

- [x] **G2c — Controlo positivo de G2**
  Reverter o `catch` para `log.error` só (cópia de backup) e correr.
  CHECK: npx vitest run src/lib/__tests__/auth-options.test.ts
  EXPECT: 1 teste vermelho
  EVIDENCE: `auth-options.test.ts (18 tests | 1 failed)` — `× fails closed when the DB lookup throws`, `AssertionError: expected { id: 'user-1', role: 'admin', …(3) } to not have property "role"`; `Tests 1 failed | 17 passed (18)`. Restaurado por cópia (`auth-options.ts = corrigido`).

- [x] **G3 — REAUD-B-14: 503 de integridade não entrega `latencyMs` sem sessão**
  CHECK: npx vitest run src/lib/__tests__/health-auth.test.ts
  EXPECT: exit 0; teste novo "503 sem cookie não tem latencyMs" verde
  EVIDENCE: 6 testes verdes (4 + 2 novos: anónimo sem `latencyMs`/`build`/`integrity`; com sessão continua a entregá-los) na corrida de 4 ficheiros.

- [x] **G3c — Controlo positivo de G3**
  Reverter o ramo 503 (cópia de backup) e correr.
  CHECK: npx vitest run src/lib/__tests__/health-auth.test.ts
  EXPECT: 1 teste vermelho
  EVIDENCE: `health-auth.test.ts (6 tests | 1 failed)` — `× sem sessão, o 503 não traz latencyMs nem build`, `AssertionError: expected +0 to be undefined`; `Tests 1 failed | 5 passed (6)`. Restaurado por cópia (`health route = corrigido`).

- [x] **G4 — REAUD-B-15: `/r/[deliveryId]` tem limite por IP na própria rota**
  Sem tocar no `matcher` — a rota é pública por desenho; o matcher arrastaria
  exigência de sessão. Limite dedicado com `checkRateLimit` + `getClientIp`
  (o endurecido, AUTH-009, importado de `@/middleware`). N+1 pedidos do mesmo
  IP → 429, e o N+1 não toca no banco.
  CHECK: npx vitest run src/lib/__tests__/notification-click-route.test.ts
  EXPECT: exit 0
  EVIDENCE: 2 testes verdes (30 × 302 e 30 gravações; o 31.º → 429 com `X-RateLimit-Remaining: 0` e sem `findUnique`/`create` extra; outro IP → 302).

- [x] **G4c — Controlo positivo de G4**
  Reverter a rota (cópia de backup) e correr.
  CHECK: npx vitest run src/lib/__tests__/notification-click-route.test.ts
  EXPECT: vermelho (N+1 devolve 302 e grava)
  EVIDENCE: primeira tentativa inválida — o backup `bak/r-route.ts` não existia (o `cp` com colisão de nome parou antes) e o teste correu contra a versão corrigida (`2 passed`). Refeito com o original tirado de `git show HEAD:` (`original tem rate limit? 0 ocorrências`): `notification-click-route.test.ts (2 tests | 1 failed)` — `× N pedidos redirecionam; o N+1 do mesmo IP leva 429`, `AssertionError: expected 302 to be 429`. Restaurado por cópia (`r route = corrigido`).

- [x] **G5 — REAUD-B-16: custo de bcrypt medido e `loginGlobal` rebaixado com número**
  CHECK: node scratchpad/bcrypt-cost.cjs && npx vitest run src/lib/__tests__/rate-limit.test.ts
  EXPECT: número em ms impresso; teste que prende o teto de `loginGlobal` verde
  EVIDENCE: `{"cost":12,"runs":10,"msPerCompare":185.3}` (bcryptjs, JS puro, custo 12 = o usado em `users/route.ts:63`, nesta máquina, 10 compares após aquecimento). Teto = N × loginGlobal × 0,185 s por minuto, na thread principal: 120 → 10 utilizadores = 222 s/min (3,7 threads); **20** → 37 s/min (62% de uma thread), saturação a partir de ~16 utilizadores. Curto-circuito: já existe — o middleware devolve 429 em `/api/auth/callback/credentials` antes de o `authorize` correr; agora medido por teste (20 IPs distintos passam com 200, o 21.º leva 429 sem tocar no `authorize`). `rate-limit.test.ts` 10 verdes (8 + 2). ADR-0012 intacta: login continua só por senha; nada de bloqueio por conta a partir de senha errada.

- [x] **G5c — Controlo positivo de G5**
  Repor `maxRequests: 120` (cópia de backup) e correr.
  CHECK: npx vitest run src/lib/__tests__/rate-limit.test.ts
  EXPECT: 1 teste vermelho
  EVIDENCE: `sed` repôs `loginGlobal: { interval: 60_000, maxRequests: 120 }` (linha 90); `rate-limit.test.ts (10 tests | 1 failed)` — `× prende loginGlobal ao orçamento de bcrypt (≤ 20/min)`, `AssertionError: expected 120 to be less than or equal to 20`; `Tests 1 failed | 9 passed (10)`. Restaurado por cópia (`rate-limit.ts = corrigido`).

- [x] **G6 — middleware-acl intacto**
  CHECK: npx vitest run src/lib/__tests__/middleware-acl.test.ts
  EXPECT: 6 passed (6)
  EVIDENCE: `Test Files 1 passed (1)`, `Tests 6 passed (6)` — depois de todas as correções e restauros. `git status` não lista `src/middleware.ts`.

- [x] **G7 — Base verde depois**
  CHECK: npm run typecheck && npm run lint && npm test
  EXPECT: exit 0 nos três; contagem de testes = G0 + novos
  EVIDENCE: `tsc --noEmit` exit 0; `eslint .` exit 0; `Test Files 143 passed | 4 skipped (147)`, `Tests 1222 passed | 9 skipped (1231)`, sem `Errors`. Delta 1175 → 1222 = 47: 32 novos (25 + 2 + 1 + 2 + 2) e 15 dos 4 ficheiros de render que em G0 não arrancavam por falta de jsdom (141 → 147 ficheiros = 2 novos + 4 de render).

- [x] **G8 — Commit e push**
  CHECK: git ls-remote origin fix/reaudit-r4
  EXPECT: SHA do HEAD local aparece no remoto
  EVIDENCE: commit `db6d69c` (10 ficheiros, +468/−5); `git push -u origin fix/reaudit-r4` → `* [new branch] fix/reaudit-r4 -> fix/reaudit-r4`; `git ls-remote origin fix/reaudit-r4` → `db6d69c202073bb491d5ba2f4306e8a9504577c6 refs/heads/fix/reaudit-r4` = `git rev-parse HEAD`. Esta linha entra num commit seguinte, só de gates.

---

## O que não fechou por inteiro

- **B-16** fecha o custo com número, não elimina o laço: com N utilizadores
  continua a haver N compares por tentativa (ADR-0012). O teto escolhido
  (20/min) assume N ≲ 16; acima disso, ou o custo desce (bcrypt nativo, ~3×
  mais rápido que bcryptjs) ou o teto desce outra vez. O `loginGlobal` mais
  baixo torna mais barato negar login a toda a gente (4 IPs × 5 em vez de 24) —
  mas isso já era trivial a 120, e a alternativa era derrubar a app inteira
  por CPU, não só o login.
- **B-17** tem uma consequência operacional: um piscar do banco agora expulsa
  as sessões das páginas (o middleware limpa os cookies quando o token volta
  sem `tokenVersion`). É o comportamento pedido e o mesmo que as rotas de API
  já tinham.
