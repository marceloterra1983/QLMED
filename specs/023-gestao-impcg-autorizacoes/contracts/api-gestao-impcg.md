# Contrato: `/api/gestao`

Prefixo page-gated: `/gestao/impcg`.
Autenticação: sessão (sem API key nesta fatia).
Empresa: `getOrCreateSingleCompany(userId)` — nunca do body/query.

## GET `/api/gestao/impcg`

**Auth**: viewer+ com a página (ou admin / `allowedPages` vazio).

**200**

```json
{
  "lastCollectedAt": "2026-08-30T13:00:00.000Z",
  "lastError": null,
  "canSync": false,
  "items": [
    {
      "id": "clx...",
      "issuedAt": "2023-08-10T00:00:00.000Z",
      "oficioNumber": "17673",
      "patientName": "PLINIO ANTONIO ARANHA JUNIOR",
      "doctorName": "RODRIGO LUIZ ROCHA CARDOSO",
      "hospitalName": "HOSPITAL PRONCOR",
      "totalAmount": "12550.00",
      "fileName": "OFICIO 17673 PLINIO ANTONIO ARANHA JUNIOR.pdf",
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

## GET `/api/gestao/impcg/:id`

**Auth**: igual à lista.

**200** — cabeçalho + itens para o popup.

```json
{
  "id": "clx...",
  "issuedAt": "2023-08-10T00:00:00.000Z",
  "oficioNumber": "17673",
  "patientName": "PLINIO ANTONIO ARANHA JUNIOR",
  "patientRegistry": "66429737-4",
  "doctorName": "RODRIGO LUIZ ROCHA CARDOSO",
  "doctorCrm": "13716",
  "procedureName": "TROCA VALVAR",
  "hospitalName": "HOSPITAL PRONCOR",
  "totalAmount": "12550.00",
  "fileName": "OFICIO 17673 PLINIO ANTONIO ARANHA JUNIOR.pdf",
  "parseStatus": "ok",
  "parseMissingReason": null,
  "items": [
    {
      "anvisaCode": null,
      "description": "KIT VÁLVULA AÓRTICA MECÂNICA",
      "brand": "SORIN",
      "reference": "A5",
      "quantity": "1",
      "unitAmount": "6500.00",
      "lineTotal": "6500.00"
    }
  ]
}
```

**404** id de outra empresa ou inexistente (mesmo 404, sem vazar).

## GET `/api/gestao/impcg/:id/arquivo`

**Auth**: igual à lista.

**200** `application/pdf` — stream do item OneDrive.
`Content-Disposition: inline; filename="..."`.
**404** sem arquivo / id inválido.
**403** sem página.
Não redirecionar para URL assinada do SharePoint no browser
(token não vaza).

## POST `/api/gestao/impcg/sync`

**Auth**: editor ou admin + página.

Dispara a mesma função do worker: caixas Graph **e** varredura
da pasta IMPCG (PDFs já no arquivo da empresa, sem reenvio).
Resposta após o ciclo (ou se o lock estiver ocupado). Caixa 403
não cancela a varredura da pasta.

**200**

```json
{
  "ok": true,
  "processed": 1,
  "skipped": 0,
  "failedMailboxes": [],
  "lastCollectedAt": "2026-08-30T13:05:00.000Z"
}
```

**409** coleta já em curso (`ok: false`, `error: "Coleta em andamento"`).
**403** viewer (AC-012).
**401** sem sessão.

Não devolver assunto, corpo de e-mail nem bytes do PDF.
