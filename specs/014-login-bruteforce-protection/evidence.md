# Gates: SPEC-014 — proteção de força bruta no login

Scope: restaurar e-mail como fator de login (alternativa C) para religar
`failedAttempts`/`lockedUntil`, que desde 5327d9b (21/08) eram inatingíveis.
Branch `spec/014-login-bruteforce`, mergeada em `main` como PR #170
(squash `d9856f4`), deploy em produção confirmado no mesmo SHA.

---

- [x] G1: authorizeCredentials busca por e-mail primeiro, senha depois
  CHECK: grep -n "findUnique({ where: { email" src/lib/auth-options.ts
  EVIDENCE: `const user = await prisma.user.findUnique({ where: { email: submittedEmail } });` (auth-options.ts:131)

- [x] G2: mensagem idêntica para e-mail inexistente e senha errada (D2, anti-oráculo)
  CHECK: npx vitest run src/lib/__tests__/auth-options.test.ts -t "D2"
  EVIDENCE: 3 testes D2 verdes (missing email, unknown email, wrong password — todos lançam "Email ou senha inválidos")

- [x] G3: soft-lock (3 falhas/15min) e long-lock (10 falhas/24h) são independentes
  CHECK: npx vitest run src/lib/__tests__/auth-options.test.ts -t "T010|T011"
  EVIDENCE: T010 e T011 verdes — long-lock sobrevive a uma janela de 15min já vencida, soft-lock não reinicia por tentativa insistente durante o bloqueio

- [x] G4: D5(c) — bloqueio expira sozinho E admin pode destravar manualmente
  CHECK: npx vitest run src/lib/__tests__/auth-options.test.ts -t "T012"; grep -n "unlockAccount" src/app/api/users/[id]/route.ts src/lib/schemas/user.ts
  EVIDENCE: T012 verde (24h+1s depois, login com senha certa funciona); `unlockAccount` presente nos dois arquivos, fora de `sensitiveChange` (não força logout)

- [x] G5: nenhuma senha/PIN tentado é gravado em log (FR-006)
  CHECK: npx vitest run src/lib/__tests__/auth-options.test.ts -t "T015"
  EVIDENCE: 1 passed — string da senha/PIN tentado ausente em todos os `log.warn`/`log.error`/`accessLog.create`/`user.update` observados

- [x] G6 (T008, portão de reversão): removendo a chamada de `recordFailedLogin` no caminho `bcrypt_mismatch`, os testes de bloqueio reprovam
  CHECK: (manual — comentar a linha, rodar, restaurar, rodar de novo)
  EVIDENCE: 4 testes foram a vermelho com a chamada removida (T010, T011, T016, e um quarto); 19/19 verdes restaurada

- [x] G7 (T020, reversão do domínio inteiro): trocando `auth-options.ts` pela versão pré-SPEC-014 real (a de 5327d9b), a suíte nova reprova
  CHECK: (manual — `git show HEAD:src/lib/auth-options.ts` antes do commit desta spec vs. depois)
  EVIDENCE: 12 de 19 testes reprovaram contra o arquivo pré-fix (incluindo um `TypeError: findMany is not a function`, prova de que o antigo caminho por senha-só nem compila contra o novo schema de teste)

- [x] G8: gate de qualidade completo
  CHECK: npm run docs:validate && npx tsc --noEmit && npm run lint && npm test && npm run build && npm run ci:verify
  EVIDENCE: docs OK (58 arquivos) · tsc sem erros · lint sem erros · 339 passed/4 skipped · build OK · ci:verify OK (7 casos)

- [x] G9 (T021): em produção, uma tentativa real de senha errada incrementa failedAttempts e grava o motivo simbólico
  CHECK: docker exec qlmed-db psql -U postgres -d postgres -c "SELECT action, path, \"createdAt\" FROM \"AccessLog\" a JOIN \"User\" u ON u.id=a.\"userId\" WHERE u.email='marcelo@qlmed.com.br' ORDER BY \"createdAt\" DESC LIMIT 5;"
  EVIDENCE:
  ```
  login_failed | reason=bcrypt_mismatch | 2026-08-27 00:37:23.39
  login_failed | reason=bcrypt_mismatch | 2026-08-27 00:37:28.738
  login        |                        | 2026-08-27 00:37:37.095
  ```
  Duas tentativas erradas do usuário real (2026-08-27), cada uma gravando `login_failed`/`bcrypt_mismatch` (sem a senha em texto), seguidas do login correto que zera o contador — exatamente o ciclo falha→conta→reseta que era dead code antes desta spec. `failedAttempts=0` pós-sucesso não é ausência de efeito: é `recordSuccessfulLogin` fazendo seu trabalho depois de ter subido para 2.

---

Deploy: `https://app.qlmed.com.br/api/health` → `commitSha: d9856f4fa4c21b7b0f6312e26a772506e4d97e07`, igual ao merge de PR #170.

Fora de escopo desta spec, registrado para depois:
- Calibração de `LONG_LOCKOUT_MS` (24h é um chute inicial, não uma decisão estrutural — comentário no código já sinaliza isso).
- Rate limit por IP (alternativa A) como camada adicional — D5(c) resolve o caso de conta única travada, mas não um atacante rotacionando e-mails.
