import type { DanfeData } from './pdf-types';
import {
  esc, fmtCnpj, fmtCep, fmtFone, fmtNum, fmtCurrency, fmtKey, fmtNfNum,
  fmtDateIso, fmtTimeIso, modFreteDanfe,
} from './pdf-utils';
import { PDF_CSS } from './pdf-css';
import { buildCode128Svg } from './code128';
import { DANFE_LOGO_SVG } from './danfe-logo';
import { splitProductsForPages } from './danfe-paginate';

const QL_MED_CNPJ_DIGITS = '07832309000197';
const QL_MED_LETTERHEAD = 'QL MED MAT. HOSP. LTDA';

function emitenteLetterheadName(d: DanfeData): string {
  const digits = (d.emitCnpj || '').replace(/\D/g, '');
  return digits === QL_MED_CNPJ_DIGITS ? QL_MED_LETTERHEAD : d.emitNome;
}

function resolvePageCount(opts?: { pageCount?: number }): number {
  const n = Math.floor(Number(opts?.pageCount ?? 1));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function money(v: string): string {
  return fmtNum(v, 2);
}

function buildCanhoto(d: DanfeData): string {
  return `
<div class="canhoto-wrapper">
  <table class="danfe">
    <tr>
      <td style="width:58%; font-size:6.5px; padding:2px 4px; line-height:1.2;">
        RECEBEMOS DE ${esc(d.emitNome)}<br>OS PRODUTOS/SERVI&Ccedil;OS CONSTANTES NA NOTA FISCAL INDICADA ABAIXO
      </td>
      <td style="width:26.5%; padding:2px 4px;">
        <span class="lbl">VALOR DA NOTA</span>
        <span class="val right" style="font-size:10px; font-weight:bold; margin-top:2px;">${fmtCurrency(d.vNF)}</span>
      </td>
      <td rowspan="2" style="width:15.5%; text-align:center; vertical-align:middle; padding:2px;">
        <div class="nfe-badge">NF-e</div>
        <div style="font-size:9.5px; font-weight:bold; margin:1px 0;">N&ordm; ${fmtNfNum(d.nNF)}</div>
        <div style="font-size:8px; font-weight:bold;">S&Eacute;RIE: ${esc(d.serie)}</div>
      </td>
    </tr>
    <tr>
      <td style="width:18.5%; height:24px; padding:2px 4px;"><span class="lbl">DATA DE RECEBIMENTO</span></td>
      <td style="width:39.5%; padding:2px 4px;"><span class="lbl">IDENTIFICA&Ccedil;&Atilde;O E ASSINATURA DO RECEBEDOR</span></td>
      <td style="width:26.5%; padding:2px 4px;">
        <span class="lbl">DESTINAT&Aacute;RIO</span>
        <span class="val" style="font-size:8px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(d.destNome)}</span>
      </td>
    </tr>
  </table>
  <div class="canhoto-line"></div>
</div>`;
}

function buildHeader(d: DanfeData, page: number, totalPages: number): string {
  const chave = (d.chNFe || '').replace(/\D/g, '');
  const barcode = chave.length === 44 ? buildCode128Svg(chave, 24) : '';
  const prot = d.nProt ? `${esc(d.nProt)} - ${esc(d.dhRecbto)}` : '';
  const isQlMed = (d.emitCnpj || '').replace(/\D/g, '') === QL_MED_CNPJ_DIGITS;

  const emitStreet = isQlMed ? 'R. Dr. Salomão Nahas, Nº 44' : d.emitEnd;
  const emitName = emitenteLetterheadName(d);

  const emitContent = isQlMed
    ? `<div class="emit-block">
        <div class="emit-logo-wrap">
          ${DANFE_LOGO_SVG}
        </div>
        <div class="emit-text">
          <div class="emit-name">${esc(emitName)}</div>
          <div class="emit-line">${esc(emitStreet)}</div>
          <div class="emit-line">Bairro: ${esc(d.emitBairro)}</div>
          <div class="emit-line">${esc(d.emitMun)} - ${esc(d.emitUF)}</div>
          <div class="emit-line">CEP: ${fmtCep(d.emitCEP)}</div>
          <div class="emit-line">FONE: ${fmtFone(d.emitFone)}</div>
        </div>
      </div>`
    : `<div class="emit-block">
        <div class="emit-text">
          <div class="emit-name">${esc(emitName)}</div>
          <div class="emit-line">${esc(emitStreet)}</div>
          <div class="emit-line">Bairro: ${esc(d.emitBairro)}</div>
          <div class="emit-line">${esc(d.emitMun)} - ${esc(d.emitUF)}</div>
          <div class="emit-line">CEP: ${fmtCep(d.emitCEP)}</div>
          <div class="emit-line">FONE: ${fmtFone(d.emitFone)}</div>
        </div>
      </div>`;

  return `
<table class="danfe">
  <tr>
    <td style="width:41.2%; padding:2px 3px;">
      ${emitContent}
    </td>
    <td style="width:15.8%;" class="danfe-box">
      <div class="danfe-title">DANFE</div>
      <div class="danfe-sub">Documento auxiliar da<br>Nota Fiscal Eletr&ocirc;nica</div>
      <div class="entry-exit-spica">
        <div class="ee-text">0 - Entrada<br>1 - Sa&iacute;da</div>
        <div class="ee-box">${esc(d.tpNF)}</div>
      </div>
      <div class="nf-num">N&ordm; ${fmtNfNum(d.nNF)}</div>
      <div class="nf-serie">S&Eacute;RIE : ${esc(d.serie)}</div>
      <div class="nf-page">FOLHA: ${page} de ${totalPages}</div>
    </td>
    <td style="width:43.0%; padding:2px 4px;" class="key-area">
      <div class="barcode-wrap">${barcode}</div>
      <div class="key-sub-box">
        <span class="lbl">CHAVE DE ACESSO</span>
        <div class="key-value">${fmtKey(d.chNFe)}</div>
      </div>
      <div class="consulta">Consulta de autenticidade no portal nacional da NF-e<br><b>www.nfe.fazenda.gov.br/portal</b> ou no site da Sefaz Autorizadora.</div>
    </td>
  </tr>
</table>
<table class="danfe">
  <tr>
    <td style="width:58%; padding:2px 4px;">
      <span class="lbl">NATUREZA DA OPERA&Ccedil;&Atilde;O</span>
      <span class="val">${esc(d.natOp)}</span>
    </td>
    <td style="width:42%; padding:2px 4px;">
      <span class="lbl">PROTOCOLO DE AUTORIZA&Ccedil;&Atilde;O DE USO</span>
      <span class="val" style="font-size:8px;">${prot}</span>
    </td>
  </tr>
</table>
<table class="danfe">
  <tr>
    <td style="width:33.3%; padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span>
      <span class="val">${esc(d.emitIE)}</span>
    </td>
    <td style="width:33.3%; padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O EST. SUB. TRIB.</span>
      <span class="val">${esc(d.emitIEST)}</span>
    </td>
    <td style="width:33.4%; padding:2px 4px;">
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
    <td colspan="3" style="width:65%; padding:2px 4px;">
      <span class="lbl">NOME/RAZ&Atilde;O SOCIAL</span><span class="val">${esc(d.destNome)}</span>
    </td>
    <td style="width:20%; padding:2px 4px;">
      <span class="lbl">CNPJ/CPF</span><span class="val">${fmtCnpj(d.destCnpj)}</span>
    </td>
    <td style="width:15%; padding:2px 4px;">
      <span class="lbl">DATA DA EMISS&Atilde;O</span><span class="val">${fmtDateIso(d.dhEmi)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="width:47%; padding:2px 4px;">
      <span class="lbl">ENDERE&Ccedil;O</span><span class="val">${esc(d.destEnd)}</span>
    </td>
    <td style="width:23%; padding:2px 4px;">
      <span class="lbl">BAIRRO/DISTRITO</span><span class="val">${esc(d.destBairro)}</span>
    </td>
    <td style="width:15%; padding:2px 4px;">
      <span class="lbl">CEP</span><span class="val">${fmtCep(d.destCEP)}</span>
    </td>
    <td style="width:15%; padding:2px 4px;">
      <span class="lbl">DATA DE SA&Iacute;DA/ENTRADA</span><span class="val">${fmtDateIso(d.dhSaiEnt || d.dhEmi)}</span>
    </td>
  </tr>
  <tr>
    <td style="width:47%; padding:2px 4px;">
      <span class="lbl">MUNIC&Iacute;PIO</span><span class="val">${esc(d.destMun)}</span>
    </td>
    <td style="width:13%; padding:2px 4px;">
      <span class="lbl">FONE/FAX</span><span class="val">${esc((d.destFone || '').replace(/\D/g, ''))}</span>
    </td>
    <td style="width:5%; padding:2px 4px;">
      <span class="lbl">UF</span><span class="val">${esc(d.destUF)}</span>
    </td>
    <td style="width:20%; padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span><span class="val">${esc(d.destIE)}</span>
    </td>
    <td style="width:15%; padding:2px 4px;">
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

function buildImpostos(d: DanfeData): string {
  return `
<table class="danfe">
  <tr><td colspan="5" class="section-title">C&Aacute;LCULO DO IMPOSTO</td></tr>
  <tr>
    <td style="width:19%; padding:2px 4px;"><span class="lbl">BASE DE C&Aacute;LCULO DE ICMS</span><span class="val right">${money(d.vBC)}</span></td>
    <td style="width:19%; padding:2px 4px;"><span class="lbl">VALOR DO ICMS</span><span class="val right">${money(d.vICMS)}</span></td>
    <td style="width:19%; padding:2px 4px;"><span class="lbl">BASE DE C&Aacute;LCULO ICMS ST</span><span class="val right">${money(d.vBCST)}</span></td>
    <td style="width:19%; padding:2px 4px;"><span class="lbl">VALOR DO ICMS SUBSTITUI&Ccedil;&Atilde;O</span><span class="val right">${money(d.vST)}</span></td>
    <td style="width:24%; padding:2px 4px;"><span class="lbl">VALOR TOTAL DOS PRODUTOS</span><span class="val right">${money(d.vProd)}</span></td>
  </tr>
</table>
<table class="danfe">
  <tr>
    <td style="width:14.3%; padding:2px 4px;"><span class="lbl">VALOR DO FRETE</span><span class="val right">${money(d.vFrete)}</span></td>
    <td style="width:14.3%; padding:2px 4px;"><span class="lbl">VALOR DO SEGURO</span><span class="val right">${money(d.vSeg)}</span></td>
    <td style="width:14.3%; padding:2px 4px;"><span class="lbl">DESCONTO</span><span class="val right">${money(d.vDesc)}</span></td>
    <td style="width:17.1%; padding:2px 4px;"><span class="lbl">OUTRAS DESPESAS ACESS&Oacute;RIAS</span><span class="val right">${money(d.vOutro)}</span></td>
    <td style="width:14.3%; padding:2px 4px;"><span class="lbl">VALOR DO IPI</span><span class="val right">${money(d.vIPI)}</span></td>
    <td style="width:12.85%; padding:2px 4px;"><span class="lbl">VAL. APROX. TRIB.</span><span class="val right">${money(d.vTotTrib)}</span></td>
    <td style="width:12.85%; padding:2px 4px;"><span class="lbl">VALOR TOTAL DA NOTA</span><span class="val right">${money(d.vNF)}</span></td>
  </tr>
</table>`;
}

function buildTransporte(d: DanfeData): string {
  return `
<table class="danfe">
  <tr><td colspan="6" class="section-title">TRANSPORTADOR/VOLUMES TRANSPORTADOS</td></tr>
  <tr>
    <td style="width:36%; padding:2px 4px;"><span class="lbl">RAZ&Atilde;O SOCIAL</span><span class="val">${esc(d.transpNome)}</span></td>
    <td style="width:12%; padding:2px 4px;"><span class="lbl">FRETE POR CONTA</span><span class="val">${modFreteDanfe(d.modFrete)}</span></td>
    <td style="width:16%; padding:2px 4px;"><span class="lbl">C&Oacute;DIGO ANTT</span><span class="val">${esc(d.veicAntt)}</span></td>
    <td style="width:12%; padding:2px 4px;"><span class="lbl">PLACA DO VE&Iacute;CULO</span><span class="val">${esc(d.veicPlaca)}</span></td>
    <td style="width:4%; padding:2px 4px;"><span class="lbl">UF</span><span class="val">${esc(d.veicUF)}</span></td>
    <td style="width:20%; padding:2px 4px;"><span class="lbl">CNPJ/CPF</span><span class="val">${fmtCnpj(d.transpCnpj)}</span></td>
  </tr>
  <tr>
    <td colspan="2" style="width:48%; padding:2px 4px;"><span class="lbl">ENDERE&Ccedil;O</span><span class="val">${esc(d.transpEnd)}</span></td>
    <td colspan="2" style="width:28%; padding:2px 4px;"><span class="lbl">MUNIC&Iacute;PIO</span><span class="val">${esc(d.transpMun)}</span></td>
    <td style="width:4%; padding:2px 4px;"><span class="lbl">UF</span><span class="val">${esc(d.transpUF)}</span></td>
    <td style="width:20%; padding:2px 4px;"><span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span><span class="val">${esc(d.transpIE)}</span></td>
  </tr>
  <tr>
    <td style="width:15%; padding:2px 4px;"><span class="lbl">QUANTIDADE</span><span class="val">${esc(d.volQtd)}</span></td>
    <td style="width:15%; padding:2px 4px;"><span class="lbl">ESP&Eacute;CIE</span><span class="val">${esc(d.volEsp)}</span></td>
    <td style="width:15%; padding:2px 4px;"><span class="lbl">MARCA</span><span class="val">${esc(d.volMarca)}</span></td>
    <td style="width:15%; padding:2px 4px;"><span class="lbl">NUMERA&Ccedil;&Atilde;O</span><span class="val">${esc(d.volNum)}</span></td>
    <td style="width:20%; padding:2px 4px;"><span class="lbl">PESO BRUTO (Kg)</span><span class="val right">${d.volPesoB ? fmtNum(d.volPesoB, 3) : ''}</span></td>
    <td style="width:20%; padding:2px 4px;"><span class="lbl">PESO LIQUIDO (Kg)</span><span class="val right">${d.volPesoL ? fmtNum(d.volPesoL, 3) : ''}</span></td>
  </tr>
</table>`;
}

function buildProducts(d: DanfeData): string {
  const rows = d.products.map((p) => {
    const desc = esc(p.xProd) + (p.infAdProd ? `<br><span class="prod-info">${esc(p.infAdProd)}</span>` : '');
    return `<tr>
      <td class="center">${esc(p.cProd)}</td>
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
      <th style="width:5.5%;">COD.</th>
      <th style="width:34%;">DESCRI&Ccedil;&Atilde;O DO PRODUTO/SERVI&Ccedil;O</th>
      <th style="width:6.5%;">NCM/SH</th>
      <th style="width:3%;">CST</th>
      <th style="width:3.5%;">CFOP</th>
      <th style="width:2.5%;">UN.</th>
      <th style="width:5.5%;">QUANT.</th>
      <th style="width:5.5%;">VAL.UNIT.</th>
      <th style="width:5.5%;">VAL.TOT.</th>
      <th style="width:5.5%;">BC ICMS</th>
      <th style="width:5%;">VAL.ICMS</th>
      <th style="width:4.5%;">VAL.IPI</th>
      <th style="width:4%;">% ICMS</th>
      <th style="width:4%;">% IPI</th>
      <th style="width:5.5%;">V.AP.TRB.</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="prods-filler">
      <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>
  </tbody>
</table>`;
}

function buildAdditional(d: DanfeData): string {
  return `
<table class="danfe dados-adicionais">
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

function buildSheet(
  d: DanfeData,
  page: number,
  totalPages: number,
  includeFrontMatter: boolean,
): string {
  return `
  <div class="page">
    <table class="danfe-sheet">
      <thead>
        <tr><td class="sheet-cell">
          ${buildCanhoto(d)}
          ${buildHeader(d, page, totalPages)}
        </td></tr>
      </thead>
      <tbody>
        <tr><td class="sheet-cell">
          ${includeFrontMatter ? `${buildDest(d)}
          ${buildFatura(d)}
          ${buildImpostos(d)}
          ${buildTransporte(d)}` : ''}
          ${buildProducts(d)}
        </td></tr>
      </tbody>
      <tfoot>
        <tr><td class="sheet-cell">
          ${buildAdditional(d)}
        </td></tr>
      </tfoot>
    </table>
  </div>`;
}

export function buildDanfeHtml(
  d: DanfeData,
  autoPrint: boolean,
  opts?: { pageCount?: number },
): string {
  const pageCount = resolvePageCount(opts);
  const sheets = pageCount <= 1
    ? [buildSheet(d, 1, 1, true)]
    : splitProductsForPages(d.products, pageCount).map((chunk, idx) =>
        buildSheet({ ...d, products: chunk }, idx + 1, pageCount, idx === 0),
      );
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>DANFE - NF-e ${fmtNfNum(d.nNF)}</title>
  <style>${PDF_CSS}</style>
</head>
<body>
  ${sheets.join('\n')}
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}

export const buildIssuedDanfeHtml = buildDanfeHtml;

