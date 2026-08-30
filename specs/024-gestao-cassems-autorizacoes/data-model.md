# Data model: SPEC-024

Empresa única (`Company`). `companyId` sempre do helper canônico.
Expand-only. Tabelas próprias — sem FK para modelos IMPCG.

## CassemsParseStatus

`ok` | `parcial` | `falha`

| De → Para | Quando |
|---|---|
| (novo) → qualquer | primeira gravação após upload ok / pasta |
| falha → parcial/ok | parse melhor |
| parcial → ok | parse melhor |
| ok → * | MUST NOT downgrade |
| * → falha | MUST NOT se já houver ok/parcial |

`parcial`: cabeçalho incompleto **ou** soma dos itens ≠ total com
desconto (FAIL-004). `falha`: texto/OCR vazio; paciente pode vir
do assunto.

## CassemsAuthorization

Um ofício OPME. Chave de negócio: número de autorização.

| Campo | Tipo | Regra |
|---|---|---|
| id | cuid | PK |
| companyId | string | FK Company, índice |
| oficioNumber | string | dígitos da autorização; unique `(companyId, oficioNumber)` |
| issuedAt | DateTime? | data impressa (`Data/hora`) |
| patientName | string | documento > assunto > `PACIENTE` |
| patientRegistry | string? | matrícula |
| doctorName | string? | prestador solicitante |
| doctorCrm | string? | só dígitos |
| procedureName | string? | |
| hospitalName | string? | local de execução |
| totalAmount | Decimal | BRL 2 casas; parser em centavos |
| oneDriveItemId | string | obrigatório se linha confirmada |
| fileName | string | existente na pasta **ou** `CASSEMS {n} {PACIENTE}.pdf` |
| parseStatus | enum | ver acima |
| receivedAt | DateTime | chegada do e-mail ou lastModified da pasta |
| createdAt / updatedAt | DateTime | |

Índice lista: `(companyId, issuedAt desc)`.

## CassemsAuthorizationItem

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
| sortOrder | Int |

Ordem de persistência = ordem no ofício. TUSS não tem coluna
própria (espelho IMPCG).

## CassemsSourceMessage

| Campo | Tipo | Regra |
|---|---|---|
| id | cuid | |
| companyId | string | |
| authorizationId | string? | preenchido após upsert |
| mailbox | string | UPN da caixa (só José Roberto nesta fatia) |
| graphMessageId | string | id Graph naquela caixa |
| internetMessageId | string | unique `(companyId, internetMessageId)` |
| receivedAt | DateTime | |

## CassemsIngestState

Uma linha por empresa.

| Campo | Tipo |
|---|---|
| companyId | unique |
| lastSuccessAt | DateTime? |
| lastError | string? | sanitizado, ≤ 500, sem e-mail/token |
| lastErrorAt | DateTime? |
| backfillCompletedAt | DateTime? | primeira varredura (pasta e/ou caixa) ok |

A UI lê `lastSuccessAt` como “última coleta”.

## Company

Relações novas: `cassemsAuthorizations`, `cassemsSourceMessages`,
`cassemsIngestState`. Sem coluna nova em `Company`.

## Validação (domínio)

- `oficioNumber`: 6–20 dígitos após normalizar (autorização
  CASSEMS; rejeita `001` e carimbos curtos).
- Totais: `Decimal` via `money.ts`; comparar soma das linhas com
  `totalAmount` em centavos inteiros.
- Sem arquivo OneDrive: transação aborta; não fica linha órfã
  confirmada.
- Paciente vazio e assunto vazio: `patientName = "PACIENTE"`,
  `parseStatus` no mínimo `parcial`.
