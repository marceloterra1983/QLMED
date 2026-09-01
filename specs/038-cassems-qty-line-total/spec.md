---
id: SPEC-038
status: approved
owner: QLMED
related_decisions:
  - ADR-0007
affected_modules:
  - cassems-parse
---

# Feature Specification: Quantidade CASSEMS pelo total da linha

**Feature Branch**: `fix/cassems-qty-from-line-total`

**Created**: 2026-08-31

**Status**: Approved

**Input**: O parser de ofício CASSEMS trata o último número de 1–4
dígitos na janela da linha como quantidade. Tokens de descrição
(“JP 12”, “10 X 5 CM”) viram QTD. O total da linha já vem impresso,
então o status permanece `ok`. Corrigir a escolha da quantidade;
não alterar extração de médico.

## Problem

Em `parseItems` (`src/lib/cassems/parse-oficio.ts`), qualquer token
`^\d{1,4}$` na janela de 180 caracteres antes do par ANVISA+valores
sobrescreve a quantidade. “JP 12” vira QTD 12; “10 X 5 CM” vira
QTD 5. O unitário e o total da linha são lidos do preço impresso,
não recalculados, então `qty × unitário ≠ total` passa despercebido.

O ofício 2439330021 (PDF de 24/06/2026) tem 4 itens, Unid.=1 e
total R$ 88.800,00. A leitura atual grava QTD 5 e 12 nessas linhas.

## Roles and ownership

- **Coleta automática (sistema)**: lê o PDF e persiste itens. Isolamento
  da empresa única no servidor. Contexto de empresa NÃO vem do pedido
  HTTP.
- **Operador / editor / admin**: sem mudança de permissão ou tela.
  Esta feature não altera ACL (SPEC-024).
- **Quem não tem a página CASSEMS**: permanece recusado no servidor.

## User scenarios and testing

### User Story 1 — Quantidade só quando fecha o total (Priority: P1)

Como sistema, ao ler a tabela de materiais do ofício, escolho a
quantidade entre os números da janela somente se
`quantidade × unitário em centavos = total da linha em centavos`.
Se nenhum candidato fechar, gravo quantidade 1.

**Why this priority**: sem essa regra o cadastro mente a QTD e o
status continua `ok`.

**Independent Test**: `parseOficio` sobre o texto extraído do ofício
2439330021 e sobre o fixture do shunt (autorização 2479325231).

**Acceptance Scenarios**:

1. **AC-001** — Given o texto real (pdftotext -layout) do ofício
   2439330021 com 4 linhas (incluindo “JP 12” e “10 X 5 CM”) e
   totais 23.000,00 / 9.600,00 / 55.000,00 / 1.200,00, when
   `parseOficio` corre, then MUST produzir 4 itens, quantidade `1`
   em todos, centavos de linha 2300000 / 960000 / 5500000 / 120000
   (em qualquer ordem) e total 8880000 centavos.
2. **AC-002** — Given a linha do shunt do fixture 2479325231
   (unitário 520,00 e total 1.560,00), when `parseOficio` corre,
   then MUST manter quantidade `3` porque 3 × 52000 = 156000.
3. **AC-003** — Given uma janela com candidatos numéricos em que
   nenhum satisfaz `qty × unitCents === lineCents`, when a linha é
   lida, then MUST gravar quantidade `1` e MUST NOT alterar
   `unitCents` nem `lineCents` lidos do preço impresso.

## Requirements

### Functional requirements

- **FR-001**: Ao ler cada linha de material, o parser MUST coletar
  os tokens `^\d{1,4}$` da janela já usada para descrição e
  quantidade. MUST escolher o candidato em que
  `qty × unitCents === lineCents` (aritmética inteira em centavos).
  Se nenhum candidato satisfizer a igualdade, MUST usar `1`.
- **FR-002**: O parser MUST NÃO recalcular `lineCents` a partir da
  quantidade. O total da linha e o unitário continuam os valores
  impressos (SPEC-024 FAIL-004).
- **FR-003**: O fixture do shunt (qty 3, 3 × 520,00 = 1.560,00)
  MUST permanecer válido.
- **FR-004**: A extração de médico / prestador solicitante MUST NÃO
  mudar nesta feature.

### Failure cases

- **FAIL-001**: Nenhum candidato fecha a conta — quantidade 1;
  unitário e total da linha inalterados; status segue a regra
  já existente de soma vs total do documento.
- **FAIL-002**: Vários candidatos fecham a conta — o parser MUST
  usar o primeiro que fechar, na ordem da janela. Caso degenerado
  (unitário 0) não ocorre nos ofícios reais.

### Non-functional

- Dinheiro em centavos inteiros; sem float.
- Sem nome de paciente em log.
- Sem dependência nova.

### Out of scope

- Extração de médico / CRM / PRESTADOR SOLICITANTE (outra tarefa).
- Recalcular ou “corrigir” o total impresso da linha ou do ofício.
- Reprocessar automaticamente todos os ofícios já persistidos.
- Mudança de schema, API ou tela.
- Apagar histórico de `CassemsSourceMessage`.

### Test strategy

- Fixture 2439330021 (texto real, paciente sintético no arquivo de
  teste): 4 itens, qty 1, 8880000 centavos.
- Fixture 2479325231 já existente: qty 3 no shunt.
- `npm test`, `npx tsc --noEmit`, `npm run lint`,
  `npm run docs:validate`.

## Key entities

- **Item aprovado**: quantidade passa a ser o inteiro que fecha
  `qty × unitário = total da linha`, ou 1.

## Success Criteria

- **SC-001**: 100% das linhas do fixture 2439330021 saem com
  quantidade 1 e a soma das linhas é 8880000 centavos.
- **SC-002**: A linha do shunt do fixture 2479325231 permanece
  quantidade 3.

## Assumptions

- A janela de 180 caracteres e o regex de ANVISA+valores permanecem.
- Unid.=1 com unitário = total da linha é o caso típico quando a
  descrição contém medidas ou códigos (“JP 12”).
- Regravação pontual do ofício 2439330021 em produção é operação
  autorizada desta tarefa, fora do código versionado.
