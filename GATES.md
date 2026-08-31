# Gates: StatusServico SOAP 4.00

Scope: Corrigir o envelope do NFeStatusServico4 (cStat 243) para o contrato NF-e 4.00 / nfephp.

- [x] G1: Envelope coloca consStatServ como filho real de nfeDadosMsg, sem wrapper nfeStatusServicoNF
  CHECK: rg -F '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">' src/lib/nfe-emission/status-servico-client.ts
  EXPECT: nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4"
  EVIDENCE: return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/0

- [x] G2: Envelope 4.00 não envia tag de cabeçalho SOAP
  CHECK: rg -n "<nfeCabecMsg" src/lib/nfe-emission/status-servico-client.ts || echo no-header
  EXPECT: no-header
  EVIDENCE: no-header

- [x] G3: Testes do envelope e parser passam
  CHECK: npx vitest run src/lib/__tests__/nfe-status-servico.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  22:36:20 | Duration  203ms (transform 50ms, setup 0ms, import 104ms, tests 9ms, environment 0ms)

- [x] G4: Typecheck
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G5: Lint dos arquivos tocados
  CHECK: npx eslint src/lib/nfe-emission/status-servico-client.ts src/lib/nfe-emission/autorizacao-client.ts src/lib/__tests__/nfe-status-servico.test.ts
  EXPECT: 
  EVIDENCE: (no output)

- [ ] G6: Produção responde cStat 107 no Testar conexão
  EVIDENCE: pending
