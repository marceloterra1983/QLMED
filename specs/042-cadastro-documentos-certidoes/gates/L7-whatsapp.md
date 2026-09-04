# Gates: L7 — Alertas WhatsApp

Scope: src/lib/documentos/alerts.ts, integração com ingest (renovação), scheduler diário 08:00 SP, health 'documentos-alert'. Desligado por padrão.

- [ ] G1: resolvedor de destino: sem ENABLED → null; sem JID → null; JID de telefone → null; sem Evolution config → null; tudo presente → {jid,port}
  CHECK: npx vitest run src/lib/__tests__/documentos-whatsapp-target.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G2: sem fallback para o grupo fiscal
  CHECK: grep -n "NOTIFICATION_WHATSAPP_GROUP\|QLMED_WHATSAPP_GROUP_JID" src/lib/documentos/*.ts; echo "rc=$?"
  EXPECT: rc=1
  EVIDENCE: pending

- [ ] G3: tick diário: dia já marcado em lastAlertDay → 0 envios; 25 dias → 0; 30 dias → 1 e não repete; -7 → 1; tipo sem documento entra no aviso; PDF anexado; legenda contém tipo, arquivo e "vence em N dias"
  CHECK: npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G4: limiar gravado ANTES do envio; falha de envio não reenvia no tick seguinte e registra erro saneado
  CHECK: grep -n "alertedThresholds" src/lib/documentos/alerts.ts | head -3; npx vitest run src/lib/__tests__/documentos-alert-tick.test.ts -t "falha" 2>&1 | tail -2
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G5: renovação: vigente 12.10.26 substituído por 12.12.26 → 1 envio; reexecução → 0; primeira carga → 0
  CHECK: npx vitest run src/lib/__tests__/documentos-renewal.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G6: nenhum log com caption/content/token (spy)
  CHECK: npx vitest run src/lib/__tests__/documentos-alert-logs.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G7: homologação real: com DOCUMENTOS_WHATSAPP_GROUP_JID de um grupo de TESTE no preview, um tick forçado entrega a mensagem; print do grupo em evidence/L7-grupo-teste.png
  EVIDENCE: pending

- [ ] G8: typecheck, lint e suíte verdes
  CHECK: npx tsc --noEmit && npm run lint --silent && npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: pending

- [ ] G9: `renewalNotifiedAt` gravado ANTES do envio da renovação (FR-011); teste prova que a reexecução não reenvia
  CHECK: grep -n "renewalNotifiedAt" src/lib/documentos/alerts.ts | head -8; npx vitest run src/lib/__tests__/documentos-renewal.test.ts 2>&1 | tail -3
  EXPECT: /passed/
  EVIDENCE: pending
