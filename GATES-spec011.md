# Gates: SPEC-011 fases A, B, C, E (T001–T011, T015–T018)

Scope: as 15 tarefas de `specs/011-n8n-workflow-status/tasks.md` que NÃO dependem
da chave de API do n8n. Fases D (formato da resposta) e F (tela) ficam de fora.

Restrições verificadas antes de começar:
- `DATABASE_URL` não existe aqui: migration é gerada e revisada, nunca aplicada.
- A chave do n8n não existe: nenhum teste toca a instância real.

---

- [x] G01: modelo de configuração da integração no schema
  CHECK: grep -c "model N8nIntegrationConfig" prisma/schema.prisma
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G02: schema Prisma válido
  CHECK: npx prisma validate 2>&1 | tail -1
  EXPECT: is valid
  EVIDENCE: The schema at prisma/schema.prisma is valid 🚀

- [x] G03: migration gerada, aditiva (só a tabela nova)
  CHECK: grep -c "CREATE TABLE \"N8nIntegrationConfig\"" prisma/migrations/*add_n8n_integration_config*/migration.sql
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G04: nenhum ALTER em tabela existente na migration
  CHECK: grep "^ALTER TABLE" prisma/migrations/*add_n8n_integration_config*/migration.sql | grep -vc N8nIntegrationConfig
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G05: rota de config cifra o token na gravação
  CHECK: grep -c "encrypt(" "src/app/api/integrations/n8n/config/route.ts"
  EXPECT: /^[1-9]/m
  EVIDENCE: 1

- [x] G06: rota de config devolve o token MASCARADO, nunca cru
  CHECK: grep -c "maskToken(" "src/app/api/integrations/n8n/config/route.ts"
  EXPECT: /^[1-9]/m
  EVIDENCE: 2

- [x] G07: cliente tem os três estados da decisão D2
  CHECK: grep -oE "'(ok|unavailable|not_configured)'" src/lib/n8n-client.ts | sort -u | wc -l
  EXPECT: /^3$/m
  EVIDENCE: 3

- [x] G08: a busca tem tempo limite explícito (FR-004)
  CHECK: grep -c "AbortSignal.timeout" src/lib/n8n-client.ts
  EXPECT: /^[1-9]/m
  EVIDENCE: 1

- [x] G09: o cliente não propaga exceção — falha é estado de dado
  CHECK: grep -c "throw " src/lib/n8n-client.ts
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G10: testes dos caminhos de falha passam
  CHECK: npx vitest run src/lib/__tests__/n8n-client.test.ts 2>&1 | grep -E "^ +Tests"
  EXPECT: passed
  EVIDENCE: Tests  16 passed (16)

- [x] G11: T011 — portão de reversão dos caminhos de falha
  EVIDENCE: parseWorkflows falho passando a virar lista vazia (`?? []`) em vez de recusar a resposta => "Tests 2 failed | 14 passed (16)", reprovando "resposta 200 com formato inesperado vira unavailable/invalid_response" e "NENHUM caminho de falha devolve workflows". Restaurado: 16 passed. O segundo é o teste que cobre a User Story 2 inteira de uma vez.

- [x] G12: cache existe e carrega o instante da obtenção
  CHECK: grep -c "fetchedAt" src/lib/n8n-status-cache.ts
  EXPECT: /^[1-9]/m
  EVIDENCE: 4

- [x] G13: em falha o cache NÃO serve valor antigo (escolha conservadora de D3)
  CHECK: npx vitest run src/lib/__tests__/n8n-status-cache.test.ts 2>&1 | grep -E "^ +Tests"
  EXPECT: passed
  EVIDENCE: Tests  6 passed (6)

- [x] G14: rota de status exige papel no servidor (Princípio II)
  CHECK: grep -cE "requireSessionRole|requireAdmin" "src/app/api/integrations/n8n/status/route.ts"
  EXPECT: /^[1-9]/m
  EVIDENCE: 2

- [x] G15: nenhum segredo em log ou resposta (Princípio V, FR-008)
  (Check reescrito: grep -c com dois arquivos imprime "caminho:contagem" por
  linha, então nunca casaria /^0$/m mesmo com o resultado correto. Somado via cat.)
  CHECK: cat src/lib/n8n-client.ts "src/app/api/integrations/n8n/status/route.ts" | grep -ciE "apiToken.*log|log.*apiToken"
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G15b: os testes de segredo e autorização passam
  CHECK: npx vitest run src/lib/__tests__/n8n-integration-secrets.test.ts 2>&1 | grep -E "^ +Tests"
  EXPECT: passed
  EVIDENCE: Tests  8 passed (8)

- [x] G16: TypeScript compila
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G17: lint limpo
  CHECK: npm run lint > /dev/null 2>&1 && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: LINT_OK

- [x] G18: suíte inteira passa
  CHECK: npm test 2>&1 | grep -E "^ +Tests"
  EXPECT: passed
  EVIDENCE: Tests  297 passed | 4 skipped (301)

- [x] G19: build passa
  CHECK: npm run build > /dev/null 2>&1 && echo BUILD_OK
  EXPECT: BUILD_OK
  EVIDENCE: BUILD_OK

- [x] G20: nada vazou para o checkout principal
  (Check reescrito: a versão anterior varria src/lib inteiro e casava com o
  trabalho em andamento de OUTRA sessão, dando falso positivo. Agora nomeia só
  os arquivos desta rodada.)
  CHECK: git -C /home/marce/qlmed/app status --short -- prisma/schema.prisma src/lib/n8n-client.ts src/lib/n8n-status-cache.ts src/lib/__tests__/n8n-client.test.ts src/lib/__tests__/n8n-status-cache.test.ts src/lib/__tests__/n8n-integration-secrets.test.ts 2>/dev/null | wc -l
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G21: a tela ainda NÃO foi tocada (Fase F fica para depois da chave)
  CHECK: git diff --name-only HEAD -- "src/app/(painel)/sistema/automacoes" | wc -l
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G22: D4 — papel exigido na rota de status
  EVIDENCE: adotado o default conservador 'admin' em status/route.ts, isolado na constante REQUIRED_ROLE com comentário apontando a pendência. Justificativa: a tela hoje não verifica papel nenhum, então isto MUDA quem a enxerga; afrouxar depois é uma linha, apertar depois que as pessoas dependem do acesso não é. DECISÃO DO DONO AINDA PENDENTE — se a intenção for manter o acesso atual, trocar REQUIRED_ROLE para 'viewer'.
