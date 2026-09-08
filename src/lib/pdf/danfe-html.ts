import type { DanfeData } from './pdf-types';
import {
  esc, fmtCnpj, fmtCep, fmtFone, fmtNum, fmtCurrency, fmtKey, fmtNfNum,
  fmtDateIso, fmtTimeIso, modFreteDanfe,
} from './pdf-utils';
import { PDF_CSS } from './pdf-css';
import { buildCode128Svg } from './code128';
import { DANFE_LOGO_SVG } from './danfe-logo';

function money(v: string): string {
  return fmtNum(v, 2);
}

function buildCanhoto(d: DanfeData): string {
  return `
<div class="canhoto-wrapper">
  <table class="danfe">
    <tr>
      <td colspan="3" style="width:78%; font-size:7px; padding:3px 4px;">
        RECEBEMOS DE ${esc(d.emitNome)} OS PRODUTOS/SERVI&Ccedil;OS CONSTANTES NA NOTA FISCAL INDICADA ABAIXO
      </td>
      <td rowspan="2" style="width:22%; text-align:center; vertical-align:middle; padding:2px;">
        <div class="lbl">VALOR DA NOTA</div>
        <div class="nfe-badge">NF-e</div>
        <div class="val-lg">${fmtCurrency(d.vNF)}</div>
        <div style="font-size:9px; font-weight:bold;">N&ordm; ${fmtNfNum(d.nNF)}</div>
        <div style="font-size:8px;">S&Eacute;RIE: ${esc(d.serie)}</div>
      </td>
    </tr>
    <tr>
      <td style="width:22%; height:22px; padding:2px 4px;"><span class="lbl">DATA DE RECEBIMENTO</span></td>
      <td style="width:34%; padding:2px 4px;"><span class="lbl">IDENTIFICA&Ccedil;&Atilde;O E ASSINATURA DO RECEBEDOR</span></td>
      <td style="width:22%; padding:2px 4px;">
        <span class="lbl">DESTINAT&Aacute;RIO</span>
        <span class="val" style="font-size:8px;">${esc(d.destNome)}</span>
      </td>
    </tr>
  </table>
  <div class="canhoto-line"></div>
</div>`;
}

function buildHeader(d: DanfeData): string {
  const chave = (d.chNFe || '').replace(/\D/g, '');
  const barcode = chave.length === 44 ? buildCode128Svg(chave, 26) : '';
  const prot = d.nProt ? `${esc(d.nProt)} - ${esc(d.dhRecbto)}` : '';
  return `
<table class="danfe">
  <tr>
    <td style="width:38%; padding:3px 4px;">
      <div class="emit-block">
        ${DANFE_LOGO_SVG}
        <div class="emit-text">
          <div class="emit-name">${esc(d.emitNome)}</div>
          <div>${esc(d.emitEnd)}</div>
          <div>Bairro: ${esc(d.emitBairro)}</div>
          <div>${esc(d.emitMun)} - ${esc(d.emitUF)}</div>
          <div>CEP: ${fmtCep(d.emitCEP)}</div>
          <div>FONE: ${fmtFone(d.emitFone)}</div>
        </div>
      </div>
    </td>
    <td style="width:24%;" class="danfe-box">
      <div class="danfe-title">DANFE</div>
      <div class="danfe-sub">Documento auxiliar da<br>Nota Fiscal Eletr&ocirc;nica</div>
      <div class="entry-exit">
        <span>0 - Entrada</span>
        <div class="box">${esc(d.tpNF)}</div>
        <span>1 - Sa&iacute;da</span>
      </div>
      <div class="nf-num">N&ordm; ${fmtNfNum(d.nNF)}</div>
      <div class="nf-serie">S&Eacute;RIE : ${esc(d.serie)}</div>
      <div class="nf-page">FOLHA: 1 de 1</div>
    </td>
    <td style="width:38%; padding:3px 5px;" class="key-area">
      <div class="barcode-wrap">${barcode}</div>
      <span class="lbl">CHAVE DE ACESSO</span>
      <div class="key-value">${fmtKey(d.chNFe)}</div>
      <div class="consulta">Consulta de autenticidade no portal nacional da NF-e
      <b>www.nfe.fazenda.gov.br/portal</b> ou no site da Sefaz Autorizadora.</div>
    </td>
  </tr>
</table>
<table class="danfe">
  <tr>
    <td style="width:50%; padding:2px 4px;">
      <span class="lbl">NATUREZA DA OPERA&Ccedil;&Atilde;O</span>
      <span class="val">${esc(d.natOp)}</span>
    </td>
    <td style="width:50%; padding:2px 4px;">
      <span class="lbl">PROTOCOLO DE AUTORIZA&Ccedil;&Atilde;O DE USO</span>
      <span class="val" style="font-size:8px;">${prot}</span>
    </td>
  </tr>
</table>
<table class="danfe">
  <tr>
    <td style="width:34%; padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span>
      <span class="val">${esc(d.emitIE)}</span>
    </td>
    <td style="width:33%; padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O EST. SUB. TRIB.</span>
      <span class="val">${esc(d.emitIEST)}</span>
    </td>
    <td style="width:33%; padding:2px 4px;">
      <span class="lbl">CNPJ</span>
      <span class="val">${fmtCnpj(d.emitCnpj)}</span>
    </td>
  </tr>
</table>`;
}

function buildDest(d: DanfeData): string {
  return `
<table class="danfe">
  <tr><td colspan="5" class="section-title">DESTINAT&Aacute;RIO/REMETENTE</td></tr>
  <tr>
    <td colspan="3" style="width:55%; padding:2px 4px;">
      <span class="lbl">NOME/RAZ&Atilde;O SOCIAL</span><span class="val">${esc(d.destNome)}</span>
    </td>
    <td style="width:25%; padding:2px 4px;">
      <span class="lbl">CNPJ/CPF</span><span class="val">${fmtCnpj(d.destCnpj)}</span>
    </td>
    <td style="width:20%; padding:2px 4px;">
      <span class="lbl">DATA DA EMISS&Atilde;O</span><span class="val">${fmtDateIso(d.dhEmi)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="width:40%; padding:2px 4px;">
      <span class="lbl">ENDERE&Ccedil;O</span><span class="val">${esc(d.destEnd)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">BAIRRO/DISTRITO</span><span class="val">${esc(d.destBairro)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">CEP</span><span class="val">${fmtCep(d.destCEP)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">DATA DE SA&Iacute;DA/ENTRADA</span><span class="val">${fmtDateIso(d.dhSaiEnt)}</span>
    </td>
  </tr>
  <tr>
    <td style="width:30%; padding:2px 4px;">
      <span class="lbl">MUNIC&Iacute;PIO</span><span class="val">${esc(d.destMun)}</span>
    </td>
    <td style="width:18%; padding:2px 4px;">
      <span class="lbl">FONE/FAX</span><span class="val">${esc((d.destFone || '').replace(/\D/g, ''))}</span>
    </td>
    <td style="width:8%; padding:2px 4px;">
      <span class="lbl">UF</span><span class="val">${esc(d.destUF)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span><span class="val">${esc(d.destIE)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">HORA DE SA&Iacute;DA</span><span class="val">${fmtTimeIso(d.dhSaiEnt)}</span>
    </td>
  </tr>
</table>`;
}

function buildFatura(d: DanfeData): string {
  const extras = d.parcelas.length === 0 && !d.fatNum
    ? ''
    : `<tr><td colspan="9" style="padding:2px 4px; font-size:8px;">
        N&uacute;mero: ${esc(d.fatNum)} &nbsp; Valor Original: ${fmtCurrency(d.fatVOrig)}
        &nbsp; Valor Desconto: ${fmtCurrency(d.fatVDesc)} &nbsp; Valor L&iacute;quido: ${fmtCurrency(d.fatVLiq)}
      </td></tr>`;
  const rows = [];
  for (let i = 0; i < d.parcelas.length; i += 3) {
    const chunk = d.parcelas.slice(i, i + 3);
    const cols = chunk.map((p) => `
      <td style="padding:1px 4px;"><span class="lbl">N&Uacute;MERO</span><span class="val">${esc(p.nDup)}</span></td>
      <td style="padding:1px 4px;"><span class="lbl">VENCIMENTO</span><span class="val">${fmtDateIso(p.dVenc)}</span></td>
      <td style="padding:1px 4px;"><span class="lbl">VALOR</span><span class="val">${fmtCurrency(p.vDup)}</span></td>`).join('');
    rows.push(`<tr>${cols}</tr>`);
  }
  return `
<table class="danfe">
  <tr><td colspan="9" class="section-title">FATURA/DUPLICATA</td></tr>
  ${extras}${rows.join('')}
</table>`;
}

function cell(label: string, value: string, extra = ''): string {
  return `<td style="padding:2px 4px;${extra}"><span class="lbl">${label}</span><span class="val right">${value}</span></td>`;
}

function buildImpostos(d: DanfeData): string {
  return `
<table class="danfe">
  <tr><td colspan="7" class="section-title">C&Aacute;LCULO DO IMPOSTO</td></tr>
  <tr>
    ${cell('BASE DE C&Aacute;LCULO DE ICMS', money(d.vBC))}
    ${cell('VALOR DO ICMS', money(d.vICMS))}
    ${cell('BASE DE C&Aacute;LCULO ICMS ST', money(d.vBCST))}
    ${cell('VALOR DO ICMS SUBSTITUI&Ccedil;&Atilde;O', money(d.vST))}
    ${cell('VALOR TOTAL DOS PRODUTOS', money(d.vProd))}
  </tr>
  <tr>
    ${cell('VALOR DO FRETE', money(d.vFrete))}
    ${cell('VALOR DO SEGURO', money(d.vSeg))}
    ${cell('DESCONTO', money(d.vDesc))}
    ${cell('OUTRAS DESPESAS ACESS&Oacute;RIAS', money(d.vOutro))}
    ${cell('VALOR DO IPI', money(d.vIPI))}
    ${cell('VAL. APROX. TRIB.', money(d.vTotTrib))}
    ${cell('VALOR TOTAL DA NOTA', money(d.vNF))}
  </tr>
</table>`;
}

function buildTransporte(d: DanfeData): string {
  return `
<table class="danfe">
  <tr><td colspan="6" class="section-title">TRANSPORTADOR/VOLUMES TRANSPORTADOS</td></tr>
  <tr>
    <td style="width:30%; padding:2px 4px;"><span class="lbl">RAZ&Atilde;O SOCIAL</span><span class="val">${esc(d.transpNome)}</span></td>
    <td style="width:14%; padding:2px 4px;"><span class="lbl">FRETE POR CONTA</span><span class="val">${modFreteDanfe(d.modFrete)}</span></td>
    <td style="width:12%; padding:2px 4px;"><span class="lbl">C&Oacute;DIGO ANTT</span><span class="val">${esc(d.veicAntt)}</span></td>
    <td style="width:12%; padding:2px 4px;"><span class="lbl">PLACA DO VE&Iacute;CULO</span><span class="val">${esc(d.veicPlaca)}</span></td>
    <td style="width:8%; padding:2px 4px;"><span class="lbl">UF</span><span class="val">${esc(d.veicUF)}</span></td>
    <td style="width:24%; padding:2px 4px;"><span class="lbl">CNPJ/CPF</span><span class="val">${fmtCnpj(d.transpCnpj)}</span></td>
  </tr>
  <tr>
    <td colspan="2" style="padding:2px 4px;"><span class="lbl">ENDERE&Ccedil;O</span><span class="val">${esc(d.transpEnd)}</span></td>
    <td colspan="2" style="padding:2px 4px;"><span class="lbl">MUNIC&Iacute;PIO</span><span class="val">${esc(d.transpMun)}</span></td>
    <td style="padding:2px 4px;"><span class="lbl">UF</span><span class="val">${esc(d.transpUF)}</span></td>
    <td style="padding:2px 4px;"><span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span><span class="val">${esc(d.transpIE)}</span></td>
  </tr>
  <tr>
    <td style="padding:2px 4px;"><span class="lbl">QUANTIDADE</span><span class="val">${esc(d.volQtd)}</span></td>
    <td style="padding:2px 4px;"><span class="lbl">ESP&Eacute;CIE</span><span class="val">${esc(d.volEsp)}</span></td>
    <td style="padding:2px 4px;"><span class="lbl">MARCA</span><span class="val">${esc(d.volMarca)}</span></td>
    <td style="padding:2px 4px;"><span class="lbl">NUMERA&Ccedil;&Atilde;O</span><span class="val">${esc(d.volNum)}</span></td>
    <td style="padding:2px 4px;"><span class="lbl">PESO BRUTO (Kg)</span><span class="val right">${d.volPesoB ? fmtNum(d.volPesoB, 3) : ''}</span></td>
    <td style="padding:2px 4px;"><span class="lbl">PESO LIQUIDO (Kg)</span><span class="val right">${d.volPesoL ? fmtNum(d.volPesoL, 3) : ''}</span></td>
  </tr>
</table>`;
}

function buildProducts(d: DanfeData): string {
  const rows = d.products.map((p) => {
    const desc = esc(p.xProd) + (p.infAdProd ? `<br><span class="prod-info">${esc(p.infAdProd)}</span>` : '');
    return `<tr>
      <td>${esc(p.cProd)}</td>
      <td class="prod-desc">${desc}</td>
      <td class="center">${esc(p.NCM)}</td>
      <td class="center">${esc(p.origCST)}</td>
      <td class="center">${esc(p.CFOP)}</td>
      <td class="center">${esc(p.uCom)}</td>
      <td class="right">${fmtNum(p.qCom, 4)}</td>
      <td class="right">${fmtNum(p.vUnCom, 4)}</td>
      <td class="right">${fmtNum(p.vProd, 2)}</td>
      <td class="right">${fmtNum(p.vBCICMS, 2)}</td>
      <td class="right">${fmtNum(p.vICMS, 2)}</td>
      <td class="right">${fmtNum(p.vIPI, 2)}</td>
      <td class="right">${fmtNum(p.pICMS, 2)}</td>
      <td class="right">${fmtNum(p.pIPI, 2)}</td>
      <td class="right">${fmtNum(p.vTotTrib, 2)}</td>
    </tr>`;
  }).join('');
  return `
<table class="prods">
  <thead>
    <tr><th colspan="15" style="text-align:left; padding:2px 4px;">DADOS DO PRODUTO/SERVI&Ccedil;O</th></tr>
    <tr>
      <th>COD.</th><th>DESCRI&Ccedil;&Atilde;O DO PRODUTO/SERVI&Ccedil;O</th>
      <th>NCM/SH</th><th>CST</th><th>CFOP</th><th>UN.</th>
      <th>QUANT.</th><th>VAL.UNIT.</th><th>VAL.TOT.</th>
      <th>BC ICMS</th><th>VAL.ICMS</th><th>VAL.IPI</th>
      <th>% ICMS</th><th>% IPI</th><th>V.AP.TRB.</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

function buildAdditional(d: DanfeData): string {
  return `
<table class="danfe">
  <tr><td colspan="2" class="section-title">DADOS ADICIONAIS</td></tr>
  <tr>
    <td style="width:65%; padding:2px 4px; min-height:36px; vertical-align:top;">
      <span class="lbl">INFORMA&Ccedil;&Otilde;ES COMPLEMENTARES</span>
      <div class="inf-cpl">${esc(d.infCpl)}</div>
    </td>
    <td style="width:35%; padding:2px 4px; vertical-align:top;">
      <span class="lbl">RESERVADO AO FISCO</span>
      <div class="inf-cpl">${esc(d.infAdFisco)}</div>
    </td>
  </tr>
</table>`;
}

export function buildDanfeHtml(d: DanfeData, autoPrint: boolean): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>DANFE - NF-e ${fmtNfNum(d.nNF)}</title>
  <style>${PDF_CSS}</style>
</head>
<body>
  <div class="page">
    ${buildCanhoto(d)}
    ${buildHeader(d)}
    ${buildDest(d)}
    ${buildFatura(d)}
    ${buildImpostos(d)}
    ${buildTransporte(d)}
    ${buildProducts(d)}
    ${buildAdditional(d)}
  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}
