# Gates: confiança TLS ICP-Brasil v10 no cliente SEFAZ

Scope: Testar conexão (e demais HTTPS SEFAZ) valida a cadeia MS com a raiz oficial ICP-Brasil v10, sem desligar rejectUnauthorized.

- [x] G1: Pacote CA inclui a raiz ICP-Brasil v10 e não substitui as CAs padrão
  CHECK: npx vitest run src/lib/__tests__/ssl-verify.test.ts src/lib/__tests__/nfe-status-servico.test.ts
  EXPECT: Test Files  2 passed
  EVIDENCE: Start at  22:08:47 | Duration  289ms (transform 83ms, setup 0ms, import 176ms, tests 19ms, environment 0ms)

- [x] G2: Typecheck
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G3: Lint
  CHECK: npm run lint && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: > eslint . | LINT_OK

- [x] G4: Fingerprint da raiz empacotada bate com a oficial do ITI
  CHECK: openssl x509 -in src/lib/certs/icp-brasil-v10.crt -noout -fingerprint -sha256
  EXPECT: 6E:0B:FF:06:9A:26:99:4C:15:DE:2C:48:88:CC:54:AF:84:88:2E:54:95:B7:FB:F6:6B:E9:CC:FF:EC:74:89:F6
  EVIDENCE: sha256 Fingerprint=6E:0B:FF:06:9A:26:99:4C:15:DE:2C:48:88:CC:54:AF:84:88:2E:54:95:B7:FB:F6:6B:E9:CC:FF:EC:74:89:F6

- [x] G5: OpenSSL com a raiz empacotada valida hom.nfe.sefaz.ms.gov.br
  CHECK: echo | openssl s_client -connect hom.nfe.sefaz.ms.gov.br:443 -servername hom.nfe.sefaz.ms.gov.br -CAfile src/lib/certs/icp-brasil-v10.crt 2>&1 | rg "Verify return code"
  EXPECT: Verify return code: 0 (ok)
  EVIDENCE: Verify return code: 0 (ok)
