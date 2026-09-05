# Gates: L7 — Alertas WhatsApp

Scope: src/lib/documentos/alerts.ts, integração com ingest (renovação), scheduler diário 08:00 SP, health 'documentos-alert'. Desligado por padrão.

- [x] G1: resolvedor de destino: sem ENABLED → null; sem JID → null; JID de telefone → null; sem Evolution config → null; tudo presente → {jid,port}
  CHECK: npx vitest run src/lib/__tests__/documentos-whatsapp-target.test.ts > /dev/null 2>&1 && echo OK_G1
  EXPECT: OK_G1
  EVIDENCE: OK_G1

- [x] G2: sem fallback para o grupo fiscal
  CHECK: grep -n "NOTIFICATION_WHATSAPP_GROUP\|QLMED_WHATSAPP_GROUP_JID" src/lib/documentos/*.ts; echo "rc=$?"
  EXPECT: rc=1
  EVIDENCE: rc=1

- [x] G3: tick diário: dia já marcado em lastAlertDay → 0 envios; 25 dias → 0; 30 dias → 1 e não repete; -7 → 1; tipo sem documento entra no aviso; PDF anexado; legenda contém tipo, arquivo e "vence em N dias"
  CHECK: npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts > /dev/null 2>&1 && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3

- [x] G4: limiar gravado ANTES do envio; falha de envio não reenvia no tick seguinte e registra erro saneado
  CHECK: grep -n "alertedThresholds" src/lib/documentos/alerts.ts | head -3; npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts -t "falha" > /dev/null 2>&1 && echo OK_G4
  EXPECT: OK_G4
  EVIDENCE: 233:    const threshold = thresholdDue(days, row.alertedThresholds ?? []); | OK_G4

- [x] G5: renovação: vigente 12.10.26 substituído por 12.12.26 → 1 envio; reexecução → 0; primeira carga → 0
  CHECK: npx vitest run src/lib/__tests__/documentos-renewal.test.ts > /dev/null 2>&1 && echo OK_G5
  EXPECT: OK_G5
  EVIDENCE: OK_G5

- [x] G6: nenhum log com caption/content/token (spy)
  CHECK: npx vitest run src/lib/__tests__/documentos-alert-logs.test.ts > /dev/null 2>&1 && echo OK_G6
  EXPECT: OK_G6
  EVIDENCE: OK_G6

- [ ] G7: homologação real: com DOCUMENTOS_WHATSAPP_GROUP_JID de um grupo de TESTE no preview, um tick forçado entrega a mensagem; print do grupo em evidence/L7-grupo-teste.png
  EVIDENCE: pending

ABANDON: G7 homologação real fica com o driver — depende do JID do grupo, que o dono ainda não forneceu

- [x] G8: typecheck, lint e suíte verdes
  CHECK: npx tsc --noEmit && npm run lint --silent && npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: (node:1029094) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set. | (Use `node --trace-warnings ...` to show where the warning was created)

- [x] G9: `renewalNotifiedAt` gravado ANTES do envio da renovação (FR-011); o sender falso falha se o campo ainda for null no momento do envio
  CHECK: grep -n "renewalNotifiedAt still null at send time" src/lib/__tests__/documentos-renewal.test.ts; npx vitest run src/lib/__tests__/documentos-renewal.test.ts > /dev/null 2>&1 && echo OK_G9
  EXPECT: OK_G9
  EVIDENCE: 204:          throw new Error('renewalNotifiedAt still null at send time'); | OK_G9

- [x] G10: B1 — sanitizeError redige o VALOR (accessToken=, refreshToken: "...", apikey":"...", Bearer, JWT, e-mail, corte 500); o nome fica visível
  CHECK: npx vitest run src/lib/__tests__/sanitize-error.test.ts > /dev/null 2>&1 && echo OK_B1
  EXPECT: OK_B1
  EVIDENCE: OK_B1

- [x] G11: B2 — tick de alerta toma advisory lock; ocupado → 0 envios; dois ticks concorrentes (lock só concede uma vez) → 1 envio
  CHECK: grep -n "documentosAlertLockKey\|acquirePostgresAdvisoryLock" src/lib/documentos/alerts.ts src/lib/postgres-advisory-lock.ts | head -20; npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts -t "concorrentes" > /dev/null 2>&1 && echo OK_B2
  EXPECT: OK_B2
  EVIDENCE: src/lib/postgres-advisory-lock.ts:122:export async function acquirePostgresAdvisoryLock( | OK_B2

- [x] G12: B3 — markBackgroundServiceError sanea na raiz; refreshToken=SEGREDO não aparece em getBackgroundServiceHealth()
  CHECK: npx vitest run src/lib/__tests__/sanitize-error.test.ts -t "markBackgroundServiceError" > /dev/null 2>&1 && echo OK_B3
  EXPECT: OK_B3
  EVIDENCE: OK_B3

- [x] G13: B4 — validade nova no mesmo itemId zera alertedThresholds e renewalNotifiedAt; validade igual preserva
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest.test.ts -t "validade" > /dev/null 2>&1 && echo OK_B4
  EXPECT: OK_B4
  EVIDENCE: OK_B4

- [x] G14: B5 — tipos sem certidão só saem da fila depois de um envio com sucesso
  CHECK: npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts -t "tipo sem certidão" > /dev/null 2>&1 && echo OK_B5
  EXPECT: OK_B5
  EVIDENCE: OK_B5

- [x] G15: B6 — getEvolutionConfig não é default argument de resolveDocumentosWhatsAppTarget; só corre depois dos guards
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/lib/documentos/alerts.ts','utf8'); const i=s.indexOf('export function resolveDocumentosWhatsAppTarget'); const header=s.slice(i, s.indexOf('{', i)); if (header.includes('getEvolutionConfig')) { console.log('FAIL_B6'); process.exit(1);} console.log('OK_B6');"
  EXPECT: OK_B6
  EVIDENCE: OK_B6

- [x] G16: B7 — sender de renovação verifica renewalNotifiedAt no momento da chamada
  CHECK: grep -n "renewalNotifiedAt still null at send time" src/lib/__tests__/documentos-renewal.test.ts; npx vitest run src/lib/__tests__/documentos-renewal.test.ts > /dev/null 2>&1 && echo OK_B7
  EXPECT: OK_B7
  EVIDENCE: 204:          throw new Error('renewalNotifiedAt still null at send time'); | OK_B7
