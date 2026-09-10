# Gates: L15 — Compartilhar (e-mail livre + WhatsApp) e cartas por e-mail

Scope: compartilhar documento com e-mail digitado e botão WhatsApp; varredura das caixas José Roberto / Marcelo / Flavio / Daniele; leitura de PDF das cartas (emissão e validade em formas variadas).

- [x] G1: e-mail digitado válido é aceite; e-mail inválido continua 400
  CHECK: npx vitest run src/lib/__tests__/documentos-share-email.test.ts -t "e-mail digitado" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G1
  EXPECT: OK_G1
  EVIDENCE: OK_G1

- [x] G2: modal de compartilhar tem campo de e-mail livre e envia o valor
  CHECK: npx vitest run src/components/__tests__/documentos-share-modal.test.tsx -t "e-mail livre" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G2
  EXPECT: OK_G2
  EVIDENCE: OK_G2

- [x] G3: WhatsApp recusa número inválido e envia PDF com JID BR normalizado
  CHECK: npx vitest run src/lib/__tests__/documentos-share-whatsapp.test.ts 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3

- [x] G4: UI tem botão específico WhatsApp (modal de gestão)
  CHECK: npx vitest run src/components/__tests__/documentos-detalhe-modal.test.tsx src/components/__tests__/documentos-share-whatsapp-modal.test.tsx 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G4
  EXPECT: OK_G4
  EVIDENCE: OK_G4

- [x] G5: parser de carta lê validade absoluta, prazo em meses/anos a contar da emissão, e rótulos alternativos
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "carta" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G5
  EXPECT: OK_G5
  EVIDENCE: OK_G5

- [x] G6: varredura de e-mail classifica anexo de carta, ignora DANFE/NF-e, e não reenvia ficheiro já existente
  CHECK: npx vitest run src/lib/__tests__/documentos-carta-mail.test.ts 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G6
  EXPECT: OK_G6
  EVIDENCE: OK_G6

- [x] G7: ingestão de carta prefere o PDF ao nome do ficheiro
  CHECK: npx vitest run src/lib/__tests__/documentos-ingest.test.ts -t "carta" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G7
  EXPECT: OK_G7
  EVIDENCE: OK_G7

- [x] G8: typecheck e lint da mudança
  CHECK: npx tsc --noEmit && npm run lint --silent && echo OK_G8
  EXPECT: OK_G8
  EVIDENCE: OK_G8
