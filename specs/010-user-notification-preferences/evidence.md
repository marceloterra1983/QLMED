# Gates: SPEC-010 — preferências de notificação (T001–T020)

Scope: executar `specs/010-user-notification-preferences/tasks.md`.
Branch `fix/ux-criticos-p1`, worktree `/home/marce/qlmed/wt-ux-criticos`.

Restrição de ambiente, verificada antes de começar: **`DATABASE_URL` não existe
neste ambiente**. Logo a migration é apenas *gerada e revisada*, nunca aplicada.
`migrate deploy` é passo humano por regra do projeto.

---

- [x] G01: modelo no schema, com relação inversa em User
  CHECK: grep -c "model UserNotificationPreference" prisma/schema.prisma
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G02: schema Prisma continua válido
  CHECK: npx prisma validate 2>&1 | tail -1
  EXPECT: is valid
  EVIDENCE: The schema at prisma/schema.prisma is valid 🚀

- [x] G03: a tabela NÃO tem companyId (é escopada a identidade, ver data-model)
  CHECK: sed -n '/^model UserNotificationPreference/,/^}/p' prisma/schema.prisma | grep -c companyId
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G04: migration gerada, com CREATE TABLE da tabela nova
  CHECK: grep -rlc "CREATE TABLE \"UserNotificationPreference\"" prisma/migrations/*add_user_notification_preferences*/migration.sql | wc -l
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G05: migration é puramente aditiva — nenhum ALTER em tabela existente
  CHECK: grep -c "^ALTER TABLE" prisma/migrations/*add_user_notification_preferences*/migration.sql
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G06: FK com ON DELETE CASCADE (entrega FR-008)
  CHECK: grep -c "ON DELETE CASCADE" prisma/migrations/*add_user_notification_preferences*/migration.sql
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G07: os dois índices do data-model existem na migration
  CHECK: grep -cE "CREATE (UNIQUE )?INDEX" prisma/migrations/*add_user_notification_preferences*/migration.sql
  EXPECT: /^2$/m
  EVIDENCE: 2

- [x] G08: módulo de domínio existe com padrão em fonte única
  CHECK: grep -c "NOTIFICATION_PREFERENCE_DEFAULTS" src/lib/notification-preferences.ts
  EXPECT: /^[1-9]/m
  EVIDENCE: 4

- [x] G09: todo valor do enum tem padrão declarado (invariante 6 do data-model)
  CHECK: npx vitest run src/lib/__tests__/notification-preferences.test.ts 2>&1 | grep -E "^ +Tests"
  EXPECT: passed
  EVIDENCE: Tests  17 passed (17)

- [x] G10: T007 — o teste de domínio reprova sem a correção
  EVIDENCE: wantsNotification forçada a "return true" => "Tests 2 failed | 10 passed (12)", reprovando "usuário que desligou não quer receber" e "distingue ligado de desligado". Restaurada: 12 passed. Executado ANTES de tocar no outbox, como o T007 exige.

- [x] G11: outbox continua com UMA consulta de usuários (sem round trip novo)
  CHECK: grep -c "tx.user.findMany" src/lib/notification-outbox.ts
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G12: assinatura de canReceiveInvoiceNotifications inalterada (decisão D2)
  CHECK: git diff -- src/lib/notification-outbox.ts | grep -c "^[-+].*export function canReceiveInvoiceNotifications"
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G13: rota não CHAMA requireAuth (check reescrito: a versão anterior contava
  a palavra e casava com o próprio comentário que explica por que não usá-la)
  CHECK: grep -c "requireAuth(" "src/app/api/users/me/notification-preferences/route.ts"
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G13b: e usa requireSessionRole de fato
  CHECK: grep -c "requireSessionRole(" "src/app/api/users/me/notification-preferences/route.ts"
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G14: nenhum id de usuário é lido da requisição (check reescrito: contar
  "userId" pegava a variável legítima derivada da sessão)
  CHECK: grep -cE "body.*userId|params.*userId|searchParams.*userId" "src/app/api/users/me/notification-preferences/route.ts"
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G14b: schema é strict, então userId no corpo vira 400 em vez de ser ignorado
  CHECK: grep -c "\.strict()" "src/app/api/users/me/notification-preferences/route.ts"
  EXPECT: /^2$/m
  EVIDENCE: 2

- [x] G15: AccessLog user_updated gravado de forma NÃO bloqueante (check
  reescrito: contar a ação não provava o .catch, que é o ponto)
  CHECK: grep -A5 "prisma.accessLog" "src/app/api/users/me/notification-preferences/route.ts" | grep -c "\.catch("
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G16: os três estados locais de preferência saíram da tela
  (Check reescrito: a versão original contava qualquer useState(true|false) e
  dava falso negativo contra o loadingPreferences, que é legítimo.)
  CHECK: grep -cE "notifyNewInvoices|notifySyncErrors|weeklyEmail" "src/app/(painel)/sistema/settings/components/PreferencesSection.tsx"
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G17: T016 — interruptores sem produtor removidos da tela
  CHECK: grep -cE "Resumo semanal|erros de sincroniza" "src/app/(painel)/sistema/settings/components/PreferencesSection.tsx"
  EXPECT: /^0$/m
  EVIDENCE: 0

- [x] G18: TypeScript compila
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G19: lint limpo
  CHECK: npm run lint > /dev/null 2>&1 && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: LINT_OK

- [x] G20: suíte inteira passa
  CHECK: npm test 2>&1 | grep -E "^ +Tests"
  EXPECT: passed
  EVIDENCE: Tests  267 passed | 4 skipped (271)

- [x] G21: build de produção passa
  CHECK: npm run build > /dev/null 2>&1 && echo BUILD_OK
  EXPECT: BUILD_OK
  EVIDENCE: BUILD_OK

- [x] G22: docs continuam válidos
  CHECK: npm run docs:validate 2>&1 | grep -c "validation passed"
  EXPECT: /^1$/m
  EVIDENCE: 1

- [x] G23: T019 — reversão final: a suíte reprova sem a composição
  EVIDENCE: Este portão ACHOU UM DEFEITO. Na primeira execução, desfazer a composição no outbox deixou a suíte VERDE ("Tests 12 passed | 2 skipped") — o teste de integração que a cobriria fica `skipped` sem RUN_DB_INTEGRATION_TESTS, então nada runnable protegia o T009. Corrigido extraindo selectNotifiableUsers como função pura exportada e cobrindo-a com 5 casos sem banco. Reexecutado: remover wantsNotification do filtro => "Tests 3 failed | 14 passed (17)". Restaurado: 17 passed.

- [x] G24: nada vazou para o checkout principal
  CHECK: git -C /home/marce/qlmed/app status --short -- prisma src/lib/notification-preferences.ts src/app/api/users | wc -l
  EXPECT: /^0$/m
  EVIDENCE: 0

- [ ] G25: T004 — verificadores de migration contra base descartável
  EVIDENCE: ver ABANDON abaixo.

ABANDON: G25 DATABASE_URL não existe neste ambiente, e scripts/verify-migrations.sh exige a variável e executa `npx prisma migrate deploy`. Aplicar migration é passo humano/CI por regra do projeto (CLAUDE.md e skill db-safety), então rodar isso aqui seria violar a regra, não cumprir o gate. O que foi possível verificar sem banco está feito e coberto por G01-G07: schema válido por `prisma validate`, SQL gerado pelo próprio Prisma via `migrate diff` (não escrito à mão), puramente aditivo, com FK CASCADE e os dois índices. Pendente do dono: rodar `npm run db:migrate:verify` e `npm run db:reconcile:verify` com DATABASE_URL apontando para o qlmed_ci descartável, antes do merge.
