# Gates: seletor de ambiente SEFAZ + StatusServico

Scope: Admin escolhe Homologação/Produção no certificado e testa conexão com NFeStatusServico4, sem autorizar NF-e.

- [x] G1: Spec 025 descreve seletor de ambiente e teste sem autorização
  CHECK: rg -n "AC-013|FR-012|StatusServico|sem autorizar" specs/025-emissao-nota-fiscal/spec.md
  EXPECT: /AC-013/
  EVIDENCE: 155:1. **AC-013** — Given um certificado instalado, when o admin | 200:- **FR-012**: Admin MUST poder gravar o ambiente do certificado

- [x] G2: Mapa MS expõe NFeStatusServico4 em homologação e produção
  CHECK: npx vitest run src/lib/__tests__/nfe-status-servico.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  20:04:16 | Duration  219ms (transform 63ms, setup 0ms, import 118ms, tests 8ms, environment 0ms)

- [x] G3: Typecheck
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G4: Lint
  CHECK: npm run lint && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: > eslint . | LINT_OK

- [x] G5: Validação Spec Kit
  CHECK: npm run docs:validate && echo DOCS_OK
  EXPECT: DOCS_OK
  EVIDENCE: Documentation validation passed (130 Markdown files, 34 IDs). | DOCS_OK

- [x] G6: UI do certificado tem Homologação e Testar conexão
  CHECK: rg -n "Homologação|Testar conexão" "src/app/(painel)/sistema/settings/components/CertificateSefazPanel.tsx"
  EXPECT: /Testar conexão/
  EVIDENCE: 122:        {statusLoading ? 'Consultando SEFAZ...' : 'Testar conexão'} | 144:        message="Produção autoriza NF-e com valor fiscal. Homologação é o ambiente certo para testar a conexão."

- [x] G7: Cliente de status não monta enviNFe nem chama Autorizacao
  CHECK: bash -c 'rg -n "enviNFe|NFeAutorizacao|authorizeInvoiceEmission" src/lib/nfe-emission/status-servico-client.ts src/app/api/certificate/status-servico/route.ts; test $? -eq 1' && echo NO_AUTORIZACAO
  EXPECT: NO_AUTORIZACAO
  EVIDENCE: NO_AUTORIZACAO

- [x] G8: Suite unitária relevante
  CHECK: npm test -- src/lib/__tests__/nfe-status-servico.test.ts src/lib/__tests__/api-route-guards.test.ts
  EXPECT: Test Files  2 passed
  EVIDENCE: Start at  20:04:23 | Duration  181ms (transform 59ms, setup 0ms, import 113ms, tests 14ms, environment 0ms)
