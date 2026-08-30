# Contrato: `/api/gestao/cassems`

Prefixo page-gated: `/gestao/cassems` (não `/gestao/impcg`).
Autenticação: sessão (sem API key nesta fatia).
Empresa: `getOrCreateSingleCompany(userId)` — nunca do body/query.

## GET `/api/gestao/cassems`

**Auth**: viewer+ com a página (ou admin / `allowedPages` vazio).
O handler MUST chamar `requireAuth(` literal.

**200**

```json
{
  "lastCollectedAt": "2026-08-30T14:30:00.000Z",
  "lastError": null,
  "canSync": false,
  "items": [
    {
      "id": "clx...",
      "issuedAt": "2026-08-28T00:00:00.000Z",
      "oficioNumber": "2479325231",
      "patientName": "DOUGLAS BARBOSA FELIPE",
      "doctorName": "ISMAEL ESCOBAR CAPIATRA",
      "hospitalName": "HOSPITAL CASSEMS UNIDADE DE CAMPO GRANDE",
      "totalAmount": "4760.00",
      "fileName": "CASSEMS001 - Oficio de materiais OPME autorizados 28-08-2026-133128021.pdf",
      "parseStatus": "ok",
      "parseMissingReason": null
    }
  ]
}
```

Ordem: `issuedAt` desc, empate `oficioNumber` desc.
`canSync`: true se editor ou admin.
`totalAmount`: string decimal (não number).
`parseMissingReason`: texto pt-BR derivado (`Faltou: …` / falha /
`null` se `ok`). Sem coluna nova.
Estado vazio: `items: []` (AC-004).

**401** não autenticado. **403** sem a página (AC-003).

## GET `/api/gestao/cassems/:id`

**Auth**: igual à lista. `requireAuth(` literal.

**200** — cabeçalho + itens para o popup.

```json
{
  "id": "clx...",
  "issuedAt": "2026-08-28T00:00:00.000Z",
  "oficioNumber": "2479325231",
  "patientName": "DOUGLAS BARBOSA FELIPE",
  "patientRegistry": "0010291552010120",
  "doctorName": "ISMAEL ESCOBAR CAPIATRA",
  "doctorCrm": null,
  "procedureName": "3.09.99.014-REVASCULARIZACAO DO MIOCARDIO SEM C.E.C.",
  "hospitalName": "HOSPITAL CASSEMS UNIDADE DE CAMPO GRANDE",
  "totalAmount": "4760.00",
  "fileName": "CASSEMS001 - Oficio de materiais OPME autorizados 28-08-2026-133128021.pdf",
  "parseStatus": "ok",
  "parseMissingReason": null,
  "items": [
    {
      "anvisaCode": "10166360035",
      "description": "SHUNT CORONARIO",
      "brand": null,
      "reference": null,
      "quantity": "3",
      "unitAmount": "520.00",
      "lineTotal": "1560.00"
    }
  ]
}
```

**404** id de outra empresa ou inexistente (mesmo 404, sem vazar).
GET inclui `canEdit` e `editedFields`.

## PATCH `/api/gestao/cassems/:id`

**Auth**: editor ou admin + página. Viewer → **403**.

Corrige os campos enviados e os marca em `editedFields`.
`issuedAt` no body: `YYYY-MM-DD` (UTC).

**200** — mesmo JSON do GET detalhe, com `canEdit: true`.
**400** body inválido. **404** id inexistente / outra empresa.

## GET `/api/gestao/cassems/:id/arquivo`

**Auth**: igual à lista. `requireAuth(` literal.

**200** `application/pdf` — stream do item OneDrive.
`Content-Disposition: inline; filename="..."`.
**404** sem arquivo / id inválido.
**403** sem página.
Não redirecionar para URL assinada do SharePoint.

## POST `/api/gestao/cassems/sync`

**Auth**: editor ou admin + página.

Dispara a mesma função do worker: caixa Graph **e** varredura
da pasta CASSEMS. Caixa 403 não cancela a varredura da pasta.

**200**

```json
{
  "ok": true,
  "processed": 1,
  "skipped": 0,
  "failedMailboxes": [],
  "lastCollectedAt": "2026-08-30T14:35:00.000Z"
}
```

**409** coleta já em curso (`ok: false`, `error: "Coleta em andamento"`).
**403** viewer (AC-012).
**401** sem sessão.

Não devolver assunto, corpo de e-mail nem bytes do PDF.
