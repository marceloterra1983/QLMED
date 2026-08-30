# Data model: SPEC-023

Empresa única (`Company`). `companyId` sempre do helper canônico.
Expand-only.

## ImpcgParseStatus

`ok` | `parcial` | `falha`

| De → Para | Quando |
|---|---|
| (novo) → qualquer | primeira gravação após upload ok |
| falha → parcial/ok | parse melhor |
| parcial → ok | parse melhor |
| ok → * | MUST NOT downgrade |
| * → falha | MUST NOT se já houver ok/parcial |

`parcial`: cabeçalho incompleto **ou** soma dos itens ≠ total do
ofício (FAIL-004). `falha`: texto/OCR vazio; paciente pode vir do
assunto.

## ImpcgAuthorization

Uma ordem de fornecimento.

| Campo | Tipo | Regra |
|---|---|---|
| id | cuid | PK |
| companyId | string | FK Company, índice |
| oficioNumber | string | dígitos; unique `(companyId, oficioNumber)` |
| issuedAt | DateTime? | data impressa no ofício |
| patientName | string | documento > assunto > `PACIENTE` |
| patientRegistry | string? | matrícula |
| doctorName | string? | |
| doctorCrm | string? | só dígitos |
| procedureName | string? | |
| hospitalName | string? | local de entrega |
| totalAmount | Decimal | BRL 2 casas; parser em centavos |
| oneDriveItemId | string | obrigatório se linha confirmada |
| fileName | string | `OFICIO {n} {PACIENTE}.pdf` |
| parseStatus | enum | ver acima |
| receivedAt | DateTime | chegada do e-mail (mais cedo se duas caixas) |
| createdAt / updatedAt | DateTime | |

Índice lista: `(companyId, issuedAt desc)`.

## ImpcgAuthorizationItem

| Campo | Tipo |
|---|---|
| id | cuid |
| authorizationId | FK cascade |
| anvisaCode | string? |
| description | string |
| brand | string? |
| reference | string? |
| quantity | Decimal |
| unitAmount | Decimal |
| lineTotal | Decimal |

Ordem de persistência = ordem no ofício.

## ImpcgSourceMessage

| Campo | Tipo | Regra |
|---|---|---|
| id | cuid | |
| companyId | string | |
| authorizationId | string? | preenchido após upsert |
| mailbox | string | UPN da caixa |
| graphMessageId | string | id Graph naquela caixa |
| internetMessageId | string | unique `(companyId, internetMessageId)` |
| receivedAt | DateTime | |

Mesmo Message-ID nas duas caixas = uma linha aqui (segunda caixa
encontra o unique e só anota se quisermos mailbox extra — v1: ignora
a segunda insert).

## ImpcgIngestState

Uma linha por empresa.

| Campo | Tipo |
|---|---|
| companyId | unique |
| lastSuccessAt | DateTime? |
| lastError | string? | sanitizado, ≤ 500, sem e-mail/token |
| lastErrorAt | DateTime? |
| backfillCompletedAt | DateTime? | primeira varredura histórica ok |

A UI lê `lastSuccessAt` como “última coleta”.

## Company

Relações novas: `impcgAuthorizations`, `impcgIngestState`. Sem
coluna nova em `Company`.

## Validação (domínio)

- `oficioNumber`: 1–20 dígitos após normalizar.
- Totais: `Decimal` via `money.ts`; comparar soma das linhas com
  `totalAmount` em centavos inteiros.
- Sem arquivo OneDrive: transação aborta; não fica linha órfã
  confirmada.
- Paciente vazio e assunto vazio: `patientName = "PACIENTE"`,
  `parseStatus` no mínimo `parcial`.
