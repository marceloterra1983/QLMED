---
id: SPEC-078
status: approved
owner: QLMED
affected_modules:
  - pdf-ocr
  - documentos-ingest
  - impcg-ingest
  - cassems-ingest
related:
  - FILE-003
---

# Feature Specification: OCR não monopoliza a CPU do Next

**Feature Branch**: `feat/078-ocr-http-cpu`

**Created**: 2026-09-19

**Status**: Approved

**Input**: KVM 8 e paginação (SPEC-077) já estão em produção. Steal ~0,3 % e
health 5–15 ms. O painel ainda compete com `pdftoppm`/`tesseract` dentro do
mesmo `qlmed-app` (medido: pdftoppm 100 % e tesseract até ~249 % de CPU no
container). O operador quer o painel ainda mais rápido.

## Problem

O pipeline PDF→OCR (FILE-003) rasteriza até 40 páginas a 300 DPI e o Tesseract
usa OpenMP em vários cores. Isso corre no processo HTTP. Enquanto uma carta ou
guia IMPCG é lida, o Next perde CPU mesmo com 8 vCPU e steal baixo.

## Roles and ownership

- **Operador**: navega o painel enquanto ingestão/OCR de documentos continua.
- **Sistema**: extrai texto de PDF hostil (e-mail/OneDrive) sem alargar auth.
- **Authorization**: inalterada. OCR não é superfície autenticada nova.
- **Company isolation**: inalterada.

## User Scenarios & Testing

### User Story 1 — Painel não perde 2–3 cores para um OCR (Priority: P1)

Como operador, abro Fiscal ou Documentos enquanto uma carta é OCRada e o
Next não fica com tesseract/pdftoppm em 2–3 cores.

**Why this priority**: é o custo de CPU medido agora na vps2, não o SQL.

**Independent Test**: cada spawn de `tesseract` e `pdftoppm` herda
`OMP_THREAD_LIMIT=1`.

**Acceptance Scenarios**:

1. **AC-078-001** — Given o caminho OCR, when `tesseract` é spawned, then o
   ambiente do filho MUST conter `OMP_THREAD_LIMIT=1`.
2. **AC-078-002** — Given o caminho OCR, when `pdftoppm` é spawned, then o
   mesmo limite MUST valer (Poppler/OpenMP).

### User Story 2 — Raster menos denso sem abandonar OCR em português (Priority: P1)

Como sistema, rasterizo páginas o bastante para OCR `-l por` sem gerar PNG
em 300 DPI (custo quadrático na área).

**Why this priority**: o `pdftoppm -r 300 -l 40` é o processo que estava a
100 % na amostra pós-KVM8.

**Independent Test**: argumentos de `pdftoppm` usam DPI 200, não 300.

**Acceptance Scenarios**:

1. **AC-078-003** — Given um PDF que cai no OCR, when `pdftoppm` corre, then
   MUST usar `-r` igual a `OCR_RASTER_DPI` (200) e MUST NOT usar 300.
2. **AC-078-004** — Given FILE-003, when o PDF tem mais páginas que o teto,
   then o skip por `MAX_OCR_PAGES` MUST permanecer.

## Requirements

- **FR-078-01**: Spawns de OCR (`pdftoppm`, `tesseract` e demais filhos do
  motor unificado) MUST definir `OMP_THREAD_LIMIT=1`.
- **FR-078-02**: A rasterização MUST usar DPI 200 (constante nomeada).
- **FR-078-03**: Tetos FILE-003 (`MAX_PDF_BYTES`, `MAX_OCR_PAGES`, orçamento
  de parede) MUST permanecer.
- **FR-078-04**: IMPCG, CASSEMS e o motor unificado MUST herdar o mesmo
  comportamento (um único `extract-text`).

## Failure cases

- Binários ausentes: continua log `ocr_binaries_missing` e texto vazio.
- PDF acima do cap / sem magic: não escreve disco (FILE-003).
- Orçamento esgotado: para o loop; não trava o event loop (já async).

## Non-functional

- OCR continua no mesmo processo (split de worker é fora de escopo).
- Sem pacote novo. Sem migration. Sem mock de auth.
- Qualidade: DPI 200 é suficiente para texto impresso em português; 300 era
  custo, não requisito de negócio.

## Out of scope

- bcryptjs / SPEC-019 (login por senha continua a varrer hashes).
- Dual stack Evolution, Home Assistant, `shared_buffers` do Postgres.
- Worker dedicado fora do Next (`QLMED_DISABLE_BACKGROUND_SERVICES`).
- Baixar `MAX_OCR_PAGES` abaixo de 40.
- niceness/`nice -n 19` (pode ser follow-up).

## Assumptions

- Tesseract e Poppler no Alpine de produção honram `OMP_THREAD_LIMIT`.
- Um core a 100 % em OCR é aceitável; dois ou três cores não.

## Success criteria

- **SC-078-01**: Testes FILE-003 provam env OpenMP e DPI 200.
- **SC-078-02**: Em produção, um OCR não aparece a ~250 % CPU no `qlmed-app`.
- **SC-078-03**: `docs:validate`, typecheck, lint e testes do recorte passam.

## Test strategy

- Estender `src/lib/__tests__/pdf-ocr-limits.test.ts`: `env.OMP_THREAD_LIMIT`
  e `-r` = `OCR_RASTER_DPI`.
- Manter recusas de magic/bytes/páginas.
- Sem spawn real de tesseract no CI.
