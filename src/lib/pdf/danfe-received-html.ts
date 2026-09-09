import type { DanfeData } from './pdf-types';
import {
  esc, fmtCnpj, fmtCep, fmtFone, fmtNum, fmtCurrency, fmtKey, fmtNfNum,
  fmtDate, fmtTime, fmtDateTime, modFreteLabel, modFreteCode,
} from './pdf-utils';

export const RECEIVED_DANFE_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #e9e9e9; }
.page { width: 210mm; margin: 10mm auto; background: #fff; padding: 5mm; }
@media print {
  body { background: #fff; }
  .page { width: 100%; margin: 0; padding: 5mm; box-shadow: none; }
  @page { size: A4 portrait; margin: 5mm; }
}

table.danfe { width: 100%; border-collapse: collapse; margin-top: -1px; }
table.danfe td, table.danfe th { border: 1px solid #000; padding: 1px 3px; vertical-align: top; font-size: 8px; }
table.danfe .lbl { display: block; font-size: 6px; font-weight: bold; text-transform: uppercase; color: #333; line-height: 1.2; margin-bottom: 0px; }
table.danfe .val { display: block; font-size: 9px; font-weight: 600; line-height: 1.3; }
table.danfe .val-lg { display: block; font-size: 11px; font-weight: 700; line-height: 1.3; }
table.danfe .val-mono { display: block; font-size: 8px; font-family: 'Courier New', monospace; line-height: 1.4; }
table.danfe .center { text-align: center; }
table.danfe .right { text-align: right; }
table.danfe .no-border-t { border-top: none; }
table.danfe .no-border-b { border-bottom: none; }
table.danfe .no-border-l { border-left: none; }
table.danfe .no-border-r { border-right: none; }
table.danfe .section-title { background: #f5f5f5; font-size: 7px; font-weight: bold; text-transform: uppercase; padding: 2px 4px; }

.canhoto-wrapper { margin-bottom: 2mm; }
.canhoto-line { border-bottom: 1px dashed #000; margin: 2mm 0; }

.danfe-box { text-align: center; padding: 2px 4px; }
.danfe-box .danfe-title { font-size: 12px; font-weight: bold; letter-spacing: 1px; }
.danfe-box .danfe-sub { font-size: 7px; line-height: 1.3; }
.danfe-box .entry-exit { display: flex; justify-content: center; align-items: center; gap: 4px; margin: 3px 0; font-size: 7px; }
.danfe-box .entry-exit .box { width: 14px; height: 14px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
.danfe-box .nf-num { font-size: 11px; font-weight: bold; margin: 2px 0; }
.danfe-box .nf-serie { font-size: 8px; }
.danfe-box .nf-page { font-size: 8px; }

.key-area { font-size: 7px; }
.key-area .key-value { font-family: 'Courier New', monospace; font-size: 9px; font-weight: bold; letter-spacing: 0.5px; word-break: break-all; margin-top: 2px; }
.key-area .consulta { font-size: 6.5px; color: #333; margin-top: 4px; line-height: 1.3; }

.nfe-badge { font-size: 14px; font-weight: bold; text-align: center; }

table.prods { width: 100%; border-collapse: collapse; margin-top: -1px; }
table.prods td, table.prods th { border: 1px solid #000; padding: 1px 2px; font-size: 7px; vertical-align: top; }
table.prods th { font-size: 6px; font-weight: bold; text-transform: uppercase; text-align: center; background: #f5f5f5; padding: 2px; }
table.prods td.right { text-align: right; }
table.prods td.center { text-align: center; }
table.prods .prod-desc { font-size: 7px; font-weight: 600; }
table.prods .prod-info { font-size: 6.5px; color: #444; }

.footer-line { font-size: 7px; display: flex; justify-content: space-between; padding: 3px 0; margin-top: 2mm; color: #555; }

.parcelas-grid { display: flex; flex-wrap: wrap; gap: 0; }
.parcela-item { border: 1px solid #000; border-left: none; padding: 1px 4px; font-size: 7px; min-width: 100px; }
.parcela-item:first-child { border-left: 1px solid #000; }
.parcela-item .lbl { font-size: 5.5px; font-weight: bold; text-transform: uppercase; }
.parcela-item .val { font-size: 7.5px; font-weight: 600; }
`;

function buildCanhoto(d: DanfeData): string {
  return `
<div class="canhoto-wrapper">
  <table class="danfe">
    <tr>
      <td colspan="3" rowspan="2" style="width:80%; font-size:7px; padding:3px 4px;">
        <span style="font-size:7px;">RECEBEMOS DE ${esc(d.emitNome)} OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO.</span><br>
        <span style="font-size:6.5px; color:#555;">Emiss&atilde;o:${fmtDate(d.dhEmi)} Dest/Reme: ${esc(d.destNome)} Valor Total: ${fmtCurrency(d.vNF)}</span>
      </td>
      <td rowspan="4" style="width:20%; text-align:center; vertical-align:middle;">
        <div class="nfe-badge">NF-e</div>
        <div style="font-size:9px; font-weight:bold;">N&ordm; ${fmtNfNum(d.nNF)}</div>
        <div style="font-size:8px;">S&Eacute;RIE: ${esc(d.serie).padStart(3, '0')}</div>
      </td>
    </tr>
    <tr></tr>
    <tr>
      <td style="width:25%; font-size:6px; padding:2px 4px;">
        <span class="lbl">DATA DE RECEBIMENTO</span>
      </td>
      <td colspan="2" style="font-size:6px; padding:2px 4px;">
        <span class="lbl">IDENTIFICA&Ccedil;&Atilde;O E ASSINATURA DO RECEBEDOR</span>
      </td>
    </tr>
  </table>
  <div class="canhoto-line"></div>
</div>`;
}

function buildHeader(d: DanfeData): string {
  const protText = d.nProt ? `${esc(d.nProt)} em: ${fmtDateTime(d.dhRecbto)}` : '';
  return `
<table class="danfe">
  <tr>
    <td rowspan="4" style="width:38%; padding:4px 6px;">
      <div style="font-size:12px; font-weight:bold; margin-bottom:2px;">${esc(d.emitNome)}</div>
      <div style="font-size:8px; line-height:1.4;">${esc(d.emitEnd)}<br>${esc(d.emitBairro)} - ${esc(d.emitMun)} - ${esc(d.emitUF)}<br>CEP: ${fmtCep(d.emitCEP)}<br>FONE: ${fmtFone(d.emitFone)}</div>
    </td>
    <td rowspan="4" style="width:22%;" class="danfe-box">
      <div class="danfe-title">DANFE</div>
      <div class="danfe-sub">DOCUMENTO<br>AUXILIAR DE NOTA<br>FISCAL ELETR&Ocirc;NICA</div>
      <div class="entry-exit">
        <span style="font-size:7px;">0 - ENTRADA</span>
        <div class="box">${esc(d.tpNF)}</div>
      </div>
      <div class="entry-exit" style="margin-top:0;">
        <span style="font-size:7px;">1 - SA&Iacute;DA</span>
        <div class="box" style="border:none;"></div>
      </div>
      <div class="nf-num">N&ordm; ${fmtNfNum(d.nNF)}</div>
      <div class="nf-serie">S&Eacute;RIE: ${esc(d.serie).padStart(3, '0')}</div>
      <div class="nf-page">P&Aacute;GINA 1 /1</div>
    </td>
    <td style="width:40%; padding:3px 5px;" class="key-area">
      <span class="lbl">CHAVE DE ACESSO</span>
      <div class="key-value">${fmtKey(d.chNFe)}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:3px 5px;" class="key-area">
      <div class="consulta">Consulta de autenticidade no portal nacional da NF-e<br><b>www.nfe.fazenda.gov.br/portal</b> ou no site da Sefaz Autorizadora.</div>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">NATUREZA DA OPERA&Ccedil;&Atilde;O</span>
      <span class="val">${esc(d.natOp)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">PROTOCOLO DE AUTORIZA&Ccedil;&Atilde;O DE USO</span>
      <span class="val">${esc(protText)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span>
      <span class="val">${esc(d.emitIE)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL DE SUBST.</span>
      <span class="val">${esc(d.emitIEST)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">CNPJ / CPF</span>
      <span class="val">${fmtCnpj(d.emitCnpj)}</span>
    </td>
  </tr>
</table>`;
}

function buildDest(d: DanfeData): string {
  return `
<table class="danfe">
  <tr>
    <td colspan="5" class="section-title">DESTINAT&Aacute;RIO / REMETENTE</td>
  </tr>
  <tr>
    <td colspan="3" style="width:55%; padding:2px 4px;">
      <span class="lbl">NOME / RAZ&Atilde;O SOCIAL</span>
      <span class="val">${esc(d.destNome)}</span>
    </td>
    <td style="width:25%; padding:2px 4px;">
      <span class="lbl">CNPJ / CPF</span>
      <span class="val">${fmtCnpj(d.destCnpj)}</span>
    </td>
    <td style="width:20%; padding:2px 4px;">
      <span class="lbl">DATA EMISS&Atilde;O</span>
      <span class="val">${fmtDate(d.dhEmi)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="width:40%; padding:2px 4px;">
      <span class="lbl">ENDERE&Ccedil;O</span>
      <span class="val">${esc(d.destEnd)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">BAIRRO / DISTRITO</span>
      <span class="val">${esc(d.destBairro)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">CEP</span>
      <span class="val">${fmtCep(d.destCEP)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">DATA SA&Iacute;DA</span>
      <span class="val">${fmtDate(d.dhSaiEnt)}</span>
    </td>
  </tr>
  <tr>
    <td style="width:30%; padding:2px 4px;">
      <span class="lbl">MUNIC&Iacute;PIO</span>
      <span class="val">${esc(d.destMun)}</span>
    </td>
    <td style="width:10%; padding:2px 4px;">
      <span class="lbl">UF</span>
      <span class="val">${esc(d.destUF)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">TELEFONE / FAX</span>
      <span class="val">${fmtFone(d.destFone)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span>
      <span class="val">${esc(d.destIE)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">HORA SA&Iacute;DA</span>
      <span class="val">${fmtTime(d.dhSaiEnt)}</span>
    </td>
  </tr>
</table>`;
}

function buildFatura(d: DanfeData): string {
  if (!d.fatNum && d.parcelas.length === 0) return '';

  let parcelasHtml = '';
  if (d.parcelas.length > 0) {
    const rows: string[] = [];
    for (let i = 0; i < d.parcelas.length; i += 3) {
      const chunk = d.parcelas.slice(i, i + 3);
      const cols = chunk.map((p) => `
        <td style="padding:1px 4px;">
          <span class="lbl">N&Uacute;MERO</span><span class="val" style="font-size:7.5px;">${esc(p.nDup)}</span>
        </td>
        <td style="padding:1px 4px;">
          <span class="lbl">VENCIMENTO</span><span class="val" style="font-size:7.5px;">${fmtDate(p.dVenc)}</span>
        </td>
        <td style="padding:1px 4px;">
          <span class="lbl">VALOR</span><span class="val" style="font-size:7.5px;">${fmtCurrency(p.vDup)}</span>
        </td>
      `).join('');
      const remaining = 3 - chunk.length;
      const padCols = '<td style="padding:1px 4px;"></td><td style="padding:1px 4px;"></td><td style="padding:1px 4px;"></td>'.repeat(remaining);
      rows.push(`<tr>${cols}${padCols}</tr>`);
    }
    parcelasHtml = `
    <tr><td colspan="9" class="section-title" style="font-size:6px;">PARCELAS</td></tr>
    ${rows.join('')}`;
  }

  return `
<table class="danfe">
  <tr>
    <td colspan="9" class="section-title">FATURA</td>
  </tr>
  <tr>
    <td colspan="9" style="padding:2px 4px; font-size:8px;">
      <b>DADOS DA FATURA</b>&nbsp;&nbsp;
      N&uacute;mero: ${esc(d.fatNum)}&nbsp;&nbsp;&nbsp;
      Valor Original: ${fmtCurrency(d.fatVOrig)}&nbsp;&nbsp;&nbsp;
      Valor Desconto: ${fmtCurrency(d.fatVDesc)}&nbsp;&nbsp;&nbsp;
      Valor L&iacute;quido: ${fmtCurrency(d.fatVLiq)}
    </td>
  </tr>
  ${parcelasHtml}
</table>`;
}

function buildImpostos(d: DanfeData): string {
  return `
<table class="danfe">
  <tr>
    <td colspan="7" class="section-title">C&Aacute;LCULO DO IMPOSTO</td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">BASE DE C&Aacute;LCULO DO ICMS</span>
      <span class="val right">${fmtCurrency(d.vBC)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR DO ICMS</span>
      <span class="val right">${fmtCurrency(d.vICMS)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">BASE DE C&Aacute;LCULO DO ICMS SUBST.</span>
      <span class="val right">${fmtCurrency(d.vBCST)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR DO ICMS SUBST.</span>
      <span class="val right">${fmtCurrency(d.vST)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR TOTAL DOS PRODUTOS</span>
      <span class="val right">${fmtCurrency(d.vProd)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR APROX. TRIBUTOS</span>
      <span class="val right">${fmtCurrency(d.vTotTrib)} (${fmtNum(d.pTotTrib)}%)</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR DO FRETE</span>
      <span class="val right">${fmtCurrency(d.vFrete)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR DO SEGURO</span>
      <span class="val right">${fmtCurrency(d.vSeg)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">DESCONTO</span>
      <span class="val right">${fmtCurrency(d.vDesc)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">OUTRAS DESPESAS ACESS&Oacute;RIAS</span>
      <span class="val right">${fmtCurrency(d.vOutro)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="3"></td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR TOTAL DO IPI</span>
      <span class="val right">${fmtCurrency(d.vIPI)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">VALOR TOTAL DA NOTA</span>
      <span class="val-lg right">${fmtCurrency(d.vNF)}</span>
    </td>
  </tr>
</table>`;
}

function buildTransporte(d: DanfeData): string {
  return `
<table class="danfe">
  <tr>
    <td colspan="6" class="section-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</td>
  </tr>
  <tr>
    <td style="width:30%; padding:2px 4px;">
      <span class="lbl">NOME / RAZ&Atilde;O SOCIAL</span>
      <span class="val">${esc(d.transpNome) || esc(modFreteLabel(d.modFrete))}</span>
    </td>
    <td style="width:15%; padding:2px 4px;">
      <span class="lbl">FRETE POR CONTA</span>
      <span class="val">${modFreteCode(d.modFrete)}</span>
    </td>
    <td style="width:12%; padding:2px 4px;">
      <span class="lbl">C&Oacute;DIGO ANTT</span>
      <span class="val">${esc(d.veicAntt)}</span>
    </td>
    <td style="width:12%; padding:2px 4px;">
      <span class="lbl">PLACA DO VE&Iacute;CULO</span>
      <span class="val">${esc(d.veicPlaca)}</span>
    </td>
    <td style="width:8%; padding:2px 4px;">
      <span class="lbl">UF</span>
      <span class="val">${esc(d.veicUF)}</span>
    </td>
    <td style="width:23%; padding:2px 4px;">
      <span class="lbl">CNPJ / CPF</span>
      <span class="val">${fmtCnpj(d.transpCnpj)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:2px 4px;">
      <span class="lbl">ENDERE&Ccedil;O</span>
      <span class="val">${esc(d.transpEnd)}</span>
    </td>
    <td colspan="2" style="padding:2px 4px;">
      <span class="lbl">MUNIC&Iacute;PIO</span>
      <span class="val">${esc(d.transpMun)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">UF</span>
      <span class="val">${esc(d.transpUF)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">INSCRI&Ccedil;&Atilde;O ESTADUAL</span>
      <span class="val">${esc(d.transpIE)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 4px;">
      <span class="lbl">QUANTIDADE</span>
      <span class="val">${esc(d.volQtd)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">ESP&Eacute;CIE</span>
      <span class="val">${esc(d.volEsp)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">MARCA</span>
      <span class="val">${esc(d.volMarca)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">NUMERA&Ccedil;&Atilde;O</span>
      <span class="val">${esc(d.volNum)}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">PESO BRUTO</span>
      <span class="val right">${d.volPesoB ? fmtNum(d.volPesoB, 3) : ''}</span>
    </td>
    <td style="padding:2px 4px;">
      <span class="lbl">PESO L&Iacute;QUIDO</span>
      <span class="val right">${d.volPesoL ? fmtNum(d.volPesoL, 3) : ''}</span>
    </td>
  </tr>
</table>`;
}

function buildProducts(d: DanfeData): string {
  const rows = d.products.map((p) => {
    const descLine = esc(p.xProd) + (p.infAdProd ? `<br><span class="prod-info">${esc(p.infAdProd)}</span>` : '');
    return `
    <tr>
      <td>${esc(p.cProd)}</td>
      <td class="prod-desc">${descLine}</td>
      <td class="center">${esc(p.NCM)}</td>
      <td class="center">${esc(p.origCST)}</td>
      <td class="center">${esc(p.CFOP)}</td>
      <td class="center">${esc(p.uCom)}</td>
      <td class="right">${fmtNum(p.qCom, 2)}</td>
      <td class="right">${fmtNum(p.vUnCom, 4)}</td>
      <td class="right">${fmtNum(p.vProd, 2)}</td>
      <td class="right">${fmtNum(p.vDesc, 2)}</td>
      <td class="right">${fmtNum(p.vBCICMS, 2)}</td>
      <td class="right">${fmtNum(p.vICMS, 2)}</td>
      <td class="right">${fmtNum(p.vIPI, 2)}</td>
      <td class="right">${fmtNum(p.pICMS, 2)}</td>
      <td class="right">${fmtNum(p.pIPI, 2)}</td>
    </tr>`;
  }).join('');

  return `
<table class="prods">
  <thead>
    <tr>
      <th colspan="15" style="text-align:left; padding:2px 4px;">DADOS DOS PRODUTOS / SERVI&Ccedil;OS</th>
    </tr>
    <tr>
      <th style="width:6%;">C&Oacute;DIGO</th>
      <th style="width:20%;">DESCRI&Ccedil;&Atilde;O DOS PRODUTOS / SERVI&Ccedil;OS</th>
      <th style="width:6%;">NCM/SH</th>
      <th style="width:3%;">CST</th>
      <th style="width:4%;">CFOP</th>
      <th style="width:3%;">UNID.</th>
      <th style="width:5%;">QTDE.</th>
      <th style="width:7%;">VALOR<br>UNIT&Aacute;RIO</th>
      <th style="width:7%;">VALOR<br>TOTAL</th>
      <th style="width:5%;">VALOR<br>DESCONTO</th>
      <th style="width:7%;">Base de C&aacute;lc.<br>ICMS</th>
      <th style="width:5%;">VALOR<br>ICMS</th>
      <th style="width:5%;">VALOR<br>IPI</th>
      <th style="width:5%;">AL&Iacute;QUOTA<br>ICMS %</th>
      <th style="width:4%;">IPI %</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="15" style="text-align:center; padding:8px; color:#888;">Nenhum item encontrado</td></tr>'}
  </tbody>
</table>`;
}

function buildAdditional(d: DanfeData): string {
  return `
<table class="danfe">
  <tr>
    <td colspan="2" class="section-title">DADOS ADICIONAIS</td>
  </tr>
  <tr>
    <td style="width:65%; padding:2px 4px; min-height:30px; vertical-align:top;">
      <span class="lbl">INFORMA&Ccedil;&Otilde;ES COMPLEMENTARES</span>
      <div style="font-size:7px; line-height:1.4; margin-top:2px; white-space:pre-wrap; word-break:break-word;">${esc(d.infCpl)}</div>
    </td>
    <td style="width:35%; padding:2px 4px; min-height:30px; vertical-align:top;">
      <span class="lbl">RESERVADO AO FISCO</span>
      <div style="font-size:7px; line-height:1.4; margin-top:2px;">${esc(d.infAdFisco)}</div>
    </td>
  </tr>
</table>`;
}

export function buildReceivedDanfeHtml(d: DanfeData, autoPrint: boolean = false): string {
  const now = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DANFE - NF-e ${fmtNfNum(d.nNF)}</title>
  <style>${RECEIVED_DANFE_CSS}</style>
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
    <div class="footer-line">
      <span>DATA E HORA DA IMPRESS&Atilde;O:${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>
  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}
