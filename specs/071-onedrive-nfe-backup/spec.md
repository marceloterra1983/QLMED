---
id: SPEC-071
status: active
owner: QLMED
affected_modules:
  - nfe-emission
  - onedrive-client
depends_on:
  - SPEC-025
  - SPEC-068
---

# Feature Specification: Backup OneDrive de NF-e autorizada

**Feature Branch**: `feat/071-onedrive-nfe-backup`
**Created**: 2026-09-08
**Status**: Active
**Spec Kit**: 071

## Problem

Após a autorização na SEFAZ, o QLMED já grava o XML e o DANFE no disco
local. O OneDrive (`/BACKUP_QL MED/NFE/{XML|Danfes}/{YYYY_MM}`) só recebia
esses arquivos pelo sync inbound. Se o disco local falhar ou o sync atrasar,
o operador não encontra o XML/DANFE no backup corporativo.

O Non-Goal de SPEC-068 (“Upload OneDrive do PDF”) fica supersedido por este
spec: a autorização passa a **enviar** XML e DANFE no mesmo instante.

## Goals

1. Depois de `finalizeAuthorized` gravar XML e DANFE locais, enviar os dois
   ao OneDrive da empresa nas pastas mensais `YYYY_MM`.
2. Reusar Graph (`resolveAccountOneDrive`, `ensureOneDriveFolder`,
   `uploadOneDriveFile`) — sem OAuth novo.
3. Falha de OneDrive NÃO altera o status da NF-e (mesmo postulado do DANFE
   local em SPEC-068).

## Non-Goals

- UI, tela de configuração ou picker de pasta.
- Schema/migration Prisma.
- Novo pacote npm ou fluxo OAuth.
- Reprocessar/backfill de notas já autorizadas.
- Alterar o sync inbound (`local-xml-sync`).

## Roles and ownership

- Sistema: o upload corre no servidor após autorização bem-sucedida.
- Credencial: conexão OneDrive da empresa (`resolveAccountOneDrive(companyId)`,
  fallback para a conexão mais recente). Sem `companyId` vindo do cliente.
- Operador: nenhuma ação extra; o backup aparece nas pastas já usadas pelo
  sync.

## Functional Requirements

- **FR-071-01**: Após `saveXmlToFile` + `persistAuthorizedDanfePdf`,
  `finalizeAuthorized` MUST chamar `uploadIssuedNfeToOneDrive`.
- **FR-071-02**: XML MUST ir para
  `{LOCAL_XML_ONEDRIVE_XML_PATH || '/BACKUP_QL MED/NFE/XML'}/{YYYY_MM}/{accessKey}-nfe.xml`
  via `buildXmlFileName(accessKey, 'NFE')`.
- **FR-071-03**: Se o persist local produziu PDF, o DANFE MUST ir para
  `{LOCAL_XML_ONEDRIVE_PDF_PATH || '/BACKUP_QL MED/NFE/Danfes'}/{YYYY_MM}/Danfe_NF#########.pdf`
  via `buildIssuedNfePdfFileName(invoiceNumber)`.
- **FR-071-04**: `YYYY_MM` MUST vir de `getMonthFolder(issueDate)` — sem
  recalcular data.
- **FR-071-05**: `uploadOneDriveFile` MUST aceitar `contentType` opcional
  (default `application/pdf`). XML usa `application/xml`; DANFE,
  `application/pdf`. Callers existentes não mudam.
- **FR-071-06**: `accessKey` rejeitada por `buildXmlFileName` MUST retornar
  `{ xmlPath: null, pdfPath: null }` sem chamar Graph.
- **FR-071-07**: Qualquer falha (conexão, pasta, upload) MUST ser capturada
  em `uploadIssuedNfeToOneDrive`, logar só `invoiceNumber` (nunca XML/token)
  e devolver nulls. O status `authorized` permanece.

## Acceptance Criteria

- **AC-001**: `issuedOneDriveXmlFolder('2026-09-08')` =
  `/BACKUP_QL MED/NFE/XML/2026_09`.
- **AC-002**: `issuedOneDrivePdfFolder('2026-09-08')` =
  `/BACKUP_QL MED/NFE/Danfes/2026_09`.
- **AC-003**: Upload do XML usa pasta `.../XML/2026_09`, nome
  `{44 dígitos}-nfe.xml` e `contentType=application/xml`.
- **AC-004**: Com Buffer de PDF e NF `65254`, envia
  `Danfe_NF000065254.pdf` em `.../Danfes/2026_09` com `application/pdf`.
- **AC-005**: `resolveAccountOneDrive` rejeitando resolve
  `{ xmlPath: null, pdfPath: null }` sem throw.
- **AC-006**: `accessKey` com path traversal não chama upload.
- **AC-007**: Teste atômico de autorização permanece verde com o upload
  mockado.

## Failure cases

- Sem conexão OneDrive da empresa: log + nulls; NF-e autorizada.
- Graph 401/403/5xx ou timeout: log + nulls; NF-e autorizada.
- Persist local do DANFE falhou: ainda tenta o XML; PDF omitido.
- `accessKey` inválida: não chama Graph.

## Out of scope

- Upload de CT-e / NFS-e.
- Reenvio manual / botão “mandar de novo ao OneDrive”.
- Trocar as pastas do sync inbound.
- Expor token ou XML fiscal em log.

## Prior Art

- SPEC-068: persist local do DANFE; Non-Goal de upload OneDrive supersedido.
- `src/lib/local-xml-sync/sync-scheduler.ts`: mesmas env de raiz.
- `src/lib/onedrive-connections.ts`: `resolveAccountOneDrive`.
