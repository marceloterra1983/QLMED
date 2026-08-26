# Tasks: Proteção contra força bruta no login

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md) — alternativa **C**, D5 = **(c)**

**Tests**: obrigatórios, e com ênfase própria: o mecanismo atual **passa em toda a suíte existente** justamente por nunca ser exercitado. Teste que não reprova sem a correção não vale aqui.

---

## Fase A — Domínio: o contador volta a ser alcançável

- [ ] **T001** Em `authorizeCredentials`, restaurar a resolução por **e-mail**: `findUnique({ where: { email } })`, depois `compare(password, passwordHash)`. É o que devolve o `user.id` antes de a senha ser validada — o ponto que hoje não existe.

- [ ] **T002** Chamar `recordFailedLogin(user.id, ...)` no caminho de senha errada (`bcrypt_mismatch`), como havia antes de `5327d9b`.

- [ ] **T003** Mesma chamada com `user.id` no caminho do PIN (`pin_email_mismatch`), decisão D3.

- [ ] **T004** **D2 — resposta idêntica.** E-mail inexistente e senha errada MUST produzir a mesma mensagem e o mesmo tempo aparente de resposta. Sem isso o login vira oráculo de enumeração de contas, e a correção teria trocado uma fraqueza por outra.

## Fase B — D5(c): as duas saídas do bloqueio

- [ ] **T005** Bloqueio por `MAX_FAILED_ATTEMPTS` passa a **expirar** após período longo, em vez de ser permanente. Corrigir junto o comentário do arquivo, que hoje diz "Permanent account lock" — senão fica documentação que mente, o defeito que esta spec existe para corrigir.

- [ ] **T006** Admin destrava conta em Sistema › Usuários: zerar `failedAttempts` e `lockedUntil`. Autorização no servidor, nunca por visibilidade de botão.

- [ ] **T007** Registrar o destravamento no `AccessLog`, para a trilha mostrar quem destravou quem.

## Fase C — Testes, falha primeiro

- [ ] **T008** **Portão de reversão.** Removida a chamada de T002, o teste de bloqueio MUST reprovar. Executar de fato e observar vermelho antes de seguir.

- [ ] **T009** Senha errada para e-mail existente incrementa `failedAttempts`.

- [ ] **T010** Atingido `SOFT_LOCK_FAILED_ATTEMPTS`, `lockedUntil` é definido e a tentativa seguinte é recusada.

- [ ] **T011** Atingido `MAX_FAILED_ATTEMPTS`, a recusa persiste depois de `lockedUntil` expirar — prova de que os dois limiares são independentes.

- [ ] **T012** Passado o período longo de T005, a conta volta a aceitar login.

- [ ] **T013** Login bem-sucedido zera contador e lock.

- [ ] **T014** E-mail inexistente e senha errada produzem a **mesma** mensagem (prova de T004).

- [ ] **T015** Nenhum registro do `AccessLog` contém a senha tentada — varredura do que foi gravado, não leitura do código.

- [ ] **T016** Falha de PIN incrementa o contador da conta certa (prova de T003).

## Fase D — Interface e testes existentes

- [ ] **T017** `src/app/login/page.tsx` volta a pedir e-mail. Hoje tem zero ocorrências de email e só um campo `type="password"`.

- [ ] **T018** Atualizar os **6 testes existentes** que assumem "senha sem e-mail": `identifies the user from the access password without email`, `ignores a submitted email and still resolves by password`, `rejects an unknown password`, `rejects when the same password matches more than one user`, `accepts a PIN-mapped password without email`, e o de senha ausente.
  Atenção: o caso "mesma senha casa com mais de um usuário" **deixa de existir** com e-mail como chave — remover, não adaptar.

## Fase E — Portões

- [ ] **T019** `npm run docs:validate && npx tsc --noEmit && npm run lint && npm test && npm run build && npm run ci:verify`. Sem verificadores de banco: não há mudança de esquema.

- [ ] **T020** **Reversão final** sobre o conjunto: desfeita a Fase A, os testes de bloqueio reprovam.

- [ ] **T021** Verificar em produção, após deploy, que `failedAttempts` volta a incrementar — hoje está em 0 nos 8 usuários. É a prova de que o mecanismo saiu do código morto.

## Critério de pronto

1. As 21 tarefas concluídas.
2. Os dois portões de reversão (T008, T020) exercitados, com a suíte observada vermelha e depois verde.
3. T019 limpo.
4. Nenhum comentário do arquivo afirmando o que o código não faz (o defeito original).

## Fora deste ciclo

- Alternativa A (contador por IP) — pode coexistir depois.
- MFA, SSO, complexidade de senha, rotação das senhas atuais.
- Reativar o auto-cadastro.
