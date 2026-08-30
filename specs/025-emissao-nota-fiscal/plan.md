# Implementation Plan: SPEC-025

**Branch**: `feat/emissao-nota-fiscal`

## Constitution check

- Auth e isolamento no servidor (I, II).
- Prisma migration de expansão (III).
- Rotas finas; domínio em `src/lib/nfe-emission` (IV).
- Sem XML/certificado em log (V).
- Spec é a fonte do contrato (VI).

## Technical approach

1. `InvoiceEmission` guarda rascunho. `Invoice` só após autorização.
2. XML 4.00 + assinatura A1 (`node-forge`) + `NFeAutorizacao4` da UF do emitente (MS).
3. Destinatário: cliente PJ extraído das emitidas + endereço do cadastro/XML.
4. Emitente: última NF-e issued da empresa.
5. Página `/fiscal/issued/nova` (ACL da lista de emitidas).
6. Admin grava `CertificateConfig.environment` sem reenviar PFX.
   Teste de conexão: `NFeStatusServico4` (MS). DistDFe operacional
   permanece em produção para não misturar NSU.

## ADRs

ADR-0001 (company do usuário), ADR-0007 (postgres canônico).
