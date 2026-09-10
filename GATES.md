# Gates: documentos update email + summary table

Scope: Em todo upload/atualização de PDF em Documentos, e-mail de
`adm@qlmed.com.br` com o PDF em anexo e tabela resumo de todos os documentos
QLMED; SMTP ligado em produção.

- [x] G1: Spec 042 documenta FR-046 (e-mail em todo update + tabela resumo)
  CHECK: rg -n "FR-046|tabela resumo" specs/042-cadastro-documentos-certidoes/spec.md
  EXPECT: /FR-046/
  EVIDENCE: pending-after-rebase

- [x] G2: Testes de e-mail update + tabela + upload + renovação passam
  CHECK: ./node_modules/.bin/vitest run src/lib/__tests__/documentos-share-email.test.ts src/lib/__tests__/documentos-update-email.test.ts src/lib/__tests__/documentos-upload-renewal.test.ts src/lib/__tests__/documentos-renewal.test.ts --reporter=dot
  EXPECT: /Test Files  4 passed/
  EVIDENCE: pending-after-rebase

- [x] G3: Remetente padrão adm@qlmed.com.br e módulo update-email
  CHECK: rg -n "adm@qlmed.com.br" src/lib/documentos/share-email.ts src/lib/documentos/update-email.ts
  EXPECT: /adm@qlmed.com.br/
  EVIDENCE: pending-after-rebase

- [x] G4: tsc --noEmit limpo
  CHECK: ./node_modules/.bin/tsc --noEmit --pretty false; echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: pending-after-rebase

- [x] G5: SMTP no container qlmed-app (só nomes)
  CHECK: docker exec qlmed-app sh -c 'printenv | cut -d= -f1 | grep ^SMTP_ | sort | tr "\n" " "'
  EXPECT: SMTP_HOST SMTP_PASS SMTP_PORT SMTP_USER
  EVIDENCE: pending-after-rebase

- [ ] G6: Smoke — e-mail CND-MT com tabela e anexo
  EVIDENCE: pending
