---
id: SPEC-072
status: active
owner: QLMED
affected_modules:
  - pdf-danfe
  - nfe-emission
depends_on:
  - SPEC-068
---

# Feature Specification: DANFE — fidelidade SPICA (logo, FOLHA, rodapé)

**Feature Branch**: `feat/072-danfe-spica-fidelity`
**Created**: 2026-09-08
**Status**: Active
**Spec Kit**: 072

## Problem

O DANFE do SPEC-068 já monta o gabarito de uma página, mas `buildDanfeHtml`
grava `FOLHA: 1 de 1` e despeja canhoto + cabeçalho + corpo + dados
adicionais num único `.page`. Quando o Chromium estoura para a página 2,
o cabeçalho (canhoto, logo, caixa DANFE) e o rodapé de dados adicionais
não se repetem. A marca QL no emitente ainda é um círculo tosco, e o
`xNome` do XML não replica o letterhead do SPICA.

Gabarito de referência (não sobrescrever): `Danfe_NF000065210.pdf`.
Página 1: DANFE completo + produtos + DADOS ADICIONAIS. Página 2: repete
canhoto + emitente/logo + caixa DANFE (`FOLHA: 2 de 2`) + natureza/protocolo/IE
+ continuação dos produtos. O original 65210 **omite** DADOS ADICIONAIS na
página 2; o requisito do operador (este spec) é o contrário.

## Goals

1. Logo QL em SVG inline (círculo/Q, veneziana, L, rabicho) — sem `data:`.
2. Cabeçalho (canhoto + emitente + caixa DANFE) repetido em cada página via
   `thead` da tabela-folha (`table-header-group`).
3. `FOLHA: X de Y` com `X` via `counter(page)` na impressão e `Y` via
   `data-total` após segunda passada de render quando houver >1 página.
4. DADOS ADICIONAIS no `tfoot` de **todas** as páginas (requisito do
   operador; o PDF 65210 original não imprime esse bloco na página 2).

## Non-Goals

- DANFE Simplificado Tipo 2 (NT 2026.003).
- Alterar o XML da NF-e ou o payload enviado à SEFAZ.
- Sobrescrever os PDFs originais `Danfe_NF000065248.pdf` /
  `Danfe_NF000065210.pdf`.
- Schema/migration Prisma.
- Pacote npm novo; imagem `data:` ou `href` externo no logo.

## Roles and ownership

- Qualquer perfil que já vê NF-e emitida: visualiza/imprime o DANFE.
- Isolamento: `companyId` do usuário autenticado. Sem `companyId` no request.
- Persistência pós-autorização continua best-effort: falha de render NÃO
  desfaz a NF-e autorizada.

## Functional Requirements

- **FR-072-01**: O logo do emitente MUST ser SVG inline (`class="emit-logo"`)
  sem URL `data:` e sem `href` externo. Disco preto, veneziana branca no
  semicírculo superior, L branca no quadrante inferior esquerdo, rabicho
  do Q à direita-embaixo.
- **FR-072-02**: Se o CNPJ do emitente (só dígitos) for `07832309000197`,
  o bloco emitente (não o canhoto) MUST imprimir `QL MED MAT. HOSP. LTDA`.
  O canhoto continua com `xNome` do XML.
- **FR-072-03**: `buildDanfeHtml` MUST estruturar a folha em
  `table.danfe-sheet` com `thead` (canhoto+header), `tbody` (dest/fatura/
  impostos/transporte/produtos) e `tfoot` (dados adicionais), para o
  Chromium repetir cabeçalho e rodapé em cada página de impressão.
- **FR-072-04**: A caixa DANFE MUST conter `FOLHA:` e um
  `.folha-counter[data-total]` com o total de páginas. Default
  `totalPages = 1`. Em `@media print`, o `::after` usa `counter(page)`.
- **FR-072-05**: `persistAuthorizedDanfePdf` MUST renderizar com
  `totalPages: 1`, contar páginas do buffer (`countPdfPages`), e se
  `pages > 1` renderizar de novo com esse total antes de gravar. Falha
  de render continua engolida (`return null`).
- **FR-072-06**: DADOS ADICIONAIS MUST aparecer no rodapé de cada página,
  inclusive página 2+ (override do operador sobre o original 65210).

## Acceptance Criteria

- **AC-001**: Fixture CNPJ `07832309000197` → HTML do emitente contém
  `QL MED MAT. HOSP. LTDA`; canhoto contém `Ql Med Materiais Hospitalares Ltda.`.
- **AC-002**: HTML default contém `FOLHA:`, `folha-counter`, `data-total="1"`,
  `danfe-sheet` e `DADOS ADICIONAIS`. Sem `data:`.
- **AC-003**: `buildDanfeHtml(d, false, { totalPages: 2 })` emite
  `data-total="2"`, um `thead` de folha com canhoto e um `tfoot` com
  DADOS ADICIONAIS mesmo com 20 produtos.
- **AC-004**: `countPdfPages` em buffer latin1 de 2 páginas devolve 2;
  buffer sem páginas devolve 1; nunca lança.
- **AC-005**: Persist de 1 página chama `renderHtmlToPdf` uma vez; primeiro
  buffer com 2 páginas chama duas vezes e o segundo HTML tem `data-total="2"`.
- **AC-006**: em `@media print`, `.folha-counter::after` usa `counter(page)`;
  o texto `1 de` só vale em `@media screen`.

## Prior Art

- SPEC-068 (leiaute SPICA 65248, Code 128C, persist pós-autorização).
- Gabarito multipage: `Danfe_NF000065210.pdf` (SPICA/ReportBuilder).
- Renderer: `src/lib/pdf/render.ts` aborta qualquer URL que não seja `about:`
  — inclui `data:`.

## Out of scope

- Recriar pixel a pixel o JPEG do letterhead (o SVG é a marca; o texto
  sai do XML, com override do nome só para o CNPJ QL MED).
- DACTE / NFS-e.
