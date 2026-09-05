# Gates: P2 — Compartilhar certidão por e-mail (backend)

Scope: `src/lib/documentos/share-email.ts`, `src/app/api/documentos/[id]/compartilhar/route.ts`, `src/lib/__tests__/documentos-share-email.test.ts`. O app envia o PDF em anexo; não é `mailto:`. Destinatários só da allowlist. Sem UI.

- [x] G1: lista exportada, ordenada, com rótulos; `daniele@qlmed.com.br` marcado `// a confirmar com o dono`
  CHECK: node -e "const fs=require('fs'); const s=fs.readFileSync('src/lib/documentos/share-email.ts','utf8'); if(!s.includes(\"export const DOCUMENTOS_SHARE_RECIPIENTS\")) process.exit(1); if(!s.includes('// a confirmar com o dono')) process.exit(2); const emails=[...s.matchAll(/email: '([^']+)'/g)].map(m=>m[1]); const want=['faturamento@qlmed.com.br','marcelo@qlmed.com.br','daniele@qlmed.com.br','flavio@qlmed.com.br','joseroberto@qlmed.com.br']; if(emails.join()!==want.join()) { console.log(emails.join()); process.exit(3);} console.log('OK_G1');"
  EXPECT: OK_G1
  EVIDENCE: OK_G1

- [x] G2: rota POST recusa e-mail fora da lista com 400 (anti-relay) e não chama sendMail
  CHECK: npx vitest run src/lib/__tests__/documentos-share-email.test.ts -t "anti-relay" > /dev/null 2>&1 && echo OK_G2
  EXPECT: OK_G2
  EVIDENCE: OK_G2

- [x] G3: envio inclui anexo PDF (`contentType: application/pdf`) com o nome real do ficheiro
  CHECK: npx vitest run src/lib/__tests__/documentos-share-email.test.ts -t "PDF em anexo" > /dev/null 2>&1 && echo OK_G3
  EXPECT: OK_G3
  EVIDENCE: OK_G3

- [x] G4: erro SMTP → 502 genérico; logger recebe `sanitizeError`, sem o segredo em claro
  CHECK: npx vitest run src/lib/__tests__/documentos-share-email.test.ts -t "nao vaza" > /dev/null 2>&1 && echo OK_G4
  EXPECT: OK_G4
  EVIDENCE: OK_G4

- [x] G5: prova negativa (i) — rota a aceitar e-mail arbitrário faz o teste anti-relay falhar; revertido
  EVIDENCE: mutação = `resolved = { ok: true, emails: parsed.data.recipients }` na rota e o mesmo no módulo (sem allowlist). Vitest: `expected 200 to be 400` em `documentos-share-email.test.ts:243`. Revertido.

- [x] G6: prova negativa (ii) — `sendMail` sem `attachments` faz o teste do PDF falhar; revertido
  EVIDENCE: removi `attachments` do `sendMail`. Vitest: `expected undefined to deeply equal [ { filename, content, contentType: application/pdf } ]` nas duas provas "PDF em anexo" (`:139` e `:268`). Revertido.

- [x] G7: prova negativa (iii) — interpolação crua do erro faz o teste de não-vazamento falhar; revertido
  EVIDENCE: `log.error({ err: raw }, \`Falha …: ${raw}\`)` em vez de `sanitizeError`. Vitest: `expected dumped not to contain 'SuperSecretPassXYZ-nao-e-jwt'` em `:290`. Revertido.

- [x] G8: guarda de sessão/ACL na rota (requireEditor + requireDocumentosPage); sem `mailto:`
  CHECK: node -e "const fs=require('fs'); const r=fs.readFileSync('src/app/api/documentos/[id]/compartilhar/route.ts','utf8'); if(!/\brequireEditor\s*\(/.test(r) || !/\brequireDocumentosPage\s*\(/.test(r)) process.exit(1); const all=r+fs.readFileSync('src/lib/documentos/share-email.ts','utf8'); if(/mailto:/i.test(all)) process.exit(2); console.log('OK_G8');"
  EXPECT: OK_G8
  EVIDENCE: OK_G8

- [x] G9: typecheck, lint e suíte da folha verdes
  CHECK: npx tsc --noEmit && npm run lint --silent && npx vitest run src/lib/__tests__/documentos-share-email.test.ts > /dev/null 2>&1 && echo OK_G9
  EXPECT: OK_G9
  EVIDENCE: OK_G9 (folha: Test Files 1 passed / Tests 13 passed)

- [x] G10: suíte inteira sentinela (&&, sem `| tail`)
  CHECK: npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: SUITE_OK. Contagem visível na corrida com reporter=dot: Tests 1606 passed | 9 skipped (1615) = base 1593 + 13 desta folha.
