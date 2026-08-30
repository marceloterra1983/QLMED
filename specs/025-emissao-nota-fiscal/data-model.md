# Data model: SPEC-025

## InvoiceEmission

Rascunho e trilha de autorização. Não substitui `Invoice`.

| Campo | Uso |
|-------|-----|
| status | draft / submitted / authorized / rejected |
| payload | JSON do formulário (destinatário, itens, operação) |
| accessKey / number | preenchidos no envio; limpos se a SEFAZ rejeitar |
| signedXml / protocolXml | evidência; nunca logar |
| invoiceId | liga à `Invoice` issued após cStat 100/150 |

Company via `companyId` do usuário autenticado.

## CertificateConfig.environment

`homologation` | `production`. Admin altera sem reenviar o PFX.
A emissão e o teste de conexão leem este campo. DistDFe operacional
não segue homologação (NSU distinto).
