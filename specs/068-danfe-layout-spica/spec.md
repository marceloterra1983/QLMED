---
id: SPEC-068
status: active
owner: QLMED
affected_modules:
  - pdf-danfe
  - nfe-emission
depends_on:
  - SPEC-025
  - SPEC-067
---

# Feature Specification: DANFE no leiaute SPICA

**Feature Branch**: `feat/068-danfe-layout-spica`
**Created**: 2026-09-08
**Status**: Active
**Spec Kit**: 068

## Problem

A NF-e 65248 autorizou na SEFAZ, mas o DANFE do QLMED não replica o PDF
que o operador já imprime no SPICA (`Danfe_NF000065248.pdf`, Producer
ReportBuilder). Faltam Code 128C, canhoto com valor/destinatário, grade de
impostos do SPICA, coluna V.AP.TRB e o protocolo no formato cru.

## Goals

1. HTML/PDF do DANFE visualmente alinhado ao gabarito SPICA 65248.
2. Barcode Code 128C da chave de 44 dígitos (MOC Anexo II).
3. Datas e hora lidas do ISO do XML, sem converter fuso.
4. Após autorização, gravar `Danfe_NF#########.pdf` no backup local.

## Non-Goals

- DANFE Simplificado Tipo 2 (NT 2026.003).
- Upload OneDrive do PDF (o sync existente já lê `/BACKUP_QL MED/NFE/Danfes`).
- Copiar a arte raster do cabeçalho SPICA; o bloco emitente é gerado do XML.
- Alterar DACTE/NFS-e.

## Roles and ownership

- Qualquer perfil que já vê NF-e emitida: visualiza/imprime o DANFE.
- Isolamento: companyId do usuário autenticado. Sem companyId no request.

## Functional Requirements

- **FR-068-01**: `buildDanfeHtml` MUST montar canhoto SPICA (texto
  “PRODUTOS/SERVIÇOS… ABAIXO”, valor da nota, NF-e/série, destinatário).
- **FR-068-02**: MUST imprimir Code 128C da chave (44 dígitos, sem `NFe`)
  em SVG inline — sem `data:` (o renderer bloqueia).
- **FR-068-03**: MUST usar datas `dd/mm/aaaa` e hora `hh:mm:ss` do
  relógio do XML (`dhEmi`/`dhSaiEnt`), e protocolo `nProt - dhRecbto` cru.
- **FR-068-04**: Grade de produtos MUST ter as colunas do SPICA, inclusive
  `V.AP.TRB.`, quantidade/unitário com 4 decimais, CST `orig+CST`.
- **FR-068-05**: `finalizeAuthorized` MUST tentar gravar o PDF via
  `persistAuthorizedDanfePdf`. Falha de render NÃO altera o status da NF-e.

## Acceptance Criteria

- **AC-001**: Fixture 65248 → HTML contém chave agrupada, protocolo
  `150260040795876 - 2026-09-08T14:41:03-04:00`, `08/09/2026`, `14:42:02`,
  `TRANSPORTE PROPRIO`, `0 - Rem.`, `4,0000`, `(Ped. Vda. 0000047442)`.
- **AC-002**: Code 128C de 44 dígitos tem 277 módulos.
- **AC-003**: Teste atômico de autorização continua verde com persist mockado.

## Prior Art

- Gabarito: `Danfe_NF000065248.pdf` (SPICA/ReportBuilder, 2026-09-08).
- MOC 7.0 Anexo II — Code 128C: https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=33lXXeWxOl0=
- NT 2020.006 / SPEC-067: XML já autorizado; este spec é só o auxiliar.

## Out of scope

- Marketplace / `indIntermed=1`.
- Recriar pixel a pixel o JPEG de cabeçalho do SPICA.
