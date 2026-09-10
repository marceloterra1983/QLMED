# Gates: WhatsApp share — lista pré-cadastrada + número livre

Scope: modal WhatsApp com checkboxes dos números da equipe e campo “Outro número”; API aceita lista.

- [x] G1: resolve allowlist + número livre; inválido falha o pedido
  CHECK: npx vitest run src/lib/__tests__/documentos-share-whatsapp.test.ts -t "resolveDocumentosWhatsAppPhones" 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G1
  EXPECT: OK_G1
  EVIDENCE: OK_G1

- [x] G2: modal lista rótulos pré-cadastrados e campo Outro número
  CHECK: npx vitest run src/components/__tests__/documentos-share-whatsapp-modal.test.tsx 2>&1 | grep -qE "Tests +[1-9][0-9]* passed" && echo OK_G2
  EXPECT: OK_G2
  EVIDENCE: OK_G2

- [x] G3: typecheck limpo
  CHECK: npx tsc --noEmit && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3
