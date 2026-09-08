---
id: SPEC-067
status: implemented
owner: QLMED
affected_modules:
  - nfe-emission
---

# Feature Specification: indIntermed + pré-envio (cStat 434)

## Contexto

SEFAZ-MS rejeitou a doação Procat com **cStat 434** (`NF-e sem indicativo do
intermediador`). O gabarito autorizado no SPICA no mesmo dia — NF-e **65248**,
chave `50260907832309000197550020000652481004640325`, protocolo
`150260040795876` — envia `indPres=9` + `indIntermed=0`.

## Prior Art

- NT 2020.006 (portal NF-e): `indIntermed` obrigatório se `tpNF=1`, `finNFe=1`
  e `indPres` ∈ {2,3,4,9}. Canal próprio = `0`. Marketplace = `1` + `infIntermed`.
  https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY=
- TOTVS / TecnoSpeed: rejeição 434 = tag ausente, não “internet = marketplace”.
- Gabarito SPICA 65248 (doação 5910 Procat): além de `indIntermed`, o leiaute
  vigente inclui `vItem`, `vNFTot`, `vFCPUFDest`/`vICMSUFDest`/`vICMSUFRemet`
  e IBS/CBS `CST=200` / `cClassTrib=200030` (LC 214/2025 art. 131, Anexo IV,
  alíquotas-teste 2026 0,10/0,00/0,90 com redução 60%).
- NT 2018.005: `infRespTec` do QLMED — **não** copiar Joinner (`73008138000100`).
- Tabela cClassTrib: https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus=
- MOC leiaute: http://moc.sped.fazenda.pr.gov.br/NFe_NFCe/Leiaute.html

## Regras

- **FR-067-01**: Toda NF-e QLMED com `indPres` 2/3/4/9 MUST emitir
  `<indIntermed>0</indIntermed>` (sem marketplace).
- **FR-067-02**: `authorizeInvoiceEmission` MUST rodar o checklist de pré-envio
  no XML unsigned **antes** de assinar/enviar. Falha → não chama SEFAZ,
  devolve `rejected` com cStat/motivo, rascunho sem número consumido.
- **FR-067-03**: O XML MUST seguir o DNA 65248 nos grupos que o SPICA já
  autorizou hoje: IBS/CBS 200030, `vItem`, `vNFTot`, totais FCP/UF dest,
  `xPais=BRASIL`, fone do emitente, `infAdProd` com lote/RVS.
- **FR-067-04**: `infRespTec` continua QLMED. Pré-envio recusa CNPJ Joinner.

## Fora de escopo

- Marketplace (`indIntermed=1`).
- Copiar `verProc` 7.159.03 ou o `infRespTec` da Joinner.
- IPI 99 / `vTotTrib` das vendas 5102 (não estão no gabarito 65248).
