import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseString } from 'xml2js';

// ==================== Helpers ====================

function parseXml(xml: string): Promise<any> {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false, trim: true, ignoreAttrs: false }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function esc(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gv(obj: any, ...keys: string[]): string {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return '';
    cur = cur[k];
  }
  if (cur == null) return '';
  if (typeof cur === 'object' && cur._ != null) return String(cur._);
  if (typeof cur === 'object') return '';
  return String(cur);
}

function ensureArray(val: any): any[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function fmtCnpj(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return v || '';
}

function fmtCep(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return v || '';
}

function fmtFone(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
  return v || '';
}

function fmtNum(v: string | number | null | undefined, dec: number = 2): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v || '0'));
  if (isNaN(n)) return '0,' + '0'.repeat(dec);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCurrency(v: string | number | null | undefined): string {
  return 'R$ ' + fmtNum(v, 2);
}

function fmtKey(k: string): string {
  return (k || '').replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function fmtNfNum(n: string): string {
  const d = (n || '0').replace(/\D/g, '').padStart(9, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
}

function fmtDate(v: string): string {
  if (!v) return '';
  try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return v; }
}

function fmtTime(v: string): string {
  if (!v) return '';
  try { return new Date(v).toLocaleTimeString('pt-BR'); } catch { return ''; }
}

function fmtDateTime(v: string): string {
  return `${fmtDate(v)} ${fmtTime(v)}`.trim();
}

function modFreteLabel(m: string): string {
  const map: Record<string, string> = {
    '0': 'FRETE POR CONTA DO EMITENTE',
    '1': 'FRETE POR CONTA DO DESTINATARIO',
    '2': 'FRETE POR CONTA DE TERCEIROS',
    '3': 'TRANSPORTE PRÓPRIO REMETENTE',
    '4': 'TRANSPORTE PRÓPRIO DESTINATÁRIO',
    '9': 'SEM FRETE',
  };
  return map[m] || '';
}

function modFreteCode(m: string): string {
  const map: Record<string, string> = {
    '0': '0 - EMIT',
    '1': '1 - DEST/REM',
    '2': '2 - TERCEIROS',
    '3': '3 - REMETENTE',
    '4': '4 - DESTINATÁRIO',
    '9': '9 - SEM FRETE',
  };
  return map[m] || m || '';
}

// ==================== Data Extraction ====================

interface DanfeProduct {
  cProd: string;
  xProd: string;
  NCM: string;
  origCST: string;
  CFOP: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  vProd: string;
  vDesc: string;
  vBCICMS: string;
  vICMS: string;
  vIPI: string;
  pICMS: string;
  pIPI: string;
  infAdProd: string;
}

interface DanfeParcela {
  nDup: string;
  dVenc: string;
  vDup: string;
}

interface DanfeData {
  chNFe: string;
  nNF: string;
  serie: string;
  dhEmi: string;
  dhSaiEnt: string;
  natOp: string;
  tpNF: string;
  nProt: string;
  dhRecbto: string;

  emitNome: string;
  emitCnpj: string;
  emitIE: string;
  emitIEST: string;
  emitEnd: string;
  emitBairro: string;
  emitMun: string;
  emitUF: string;
  emitCEP: string;
  emitFone: string;

  destNome: string;
  destCnpj: string;
  destIE: string;
  destEnd: string;
  destBairro: string;
  destMun: string;
  destUF: string;
  destCEP: string;
  destFone: string;

  vBC: string;
  vICMS: string;
  vBCST: string;
  vST: string;
  vProd: string;
  vFrete: string;
  vSeg: string;
  vDesc: string;
  vOutro: string;
  vIPI: string;
  vNF: string;
  vTotTrib: string;
  pTotTrib: string;

  products: DanfeProduct[];

  modFrete: string;
  transpNome: string;
  transpCnpj: string;
  transpIE: string;
  transpEnd: string;
  transpMun: string;
  transpUF: string;
  veicPlaca: string;
  veicUF: string;
  veicAntt: string;
  volQtd: string;
  volEsp: string;
  volMarca: string;
  volNum: string;
  volPesoB: string;
  volPesoL: string;

  fatNum: string;
  fatVOrig: string;
  fatVDesc: string;
  fatVLiq: string;
  parcelas: DanfeParcela[];

  infCpl: string;
  infAdFisco: string;
}

function extractDanfeData(parsed: any): DanfeData {
  const proc = parsed.nfeProc || parsed.NFe || parsed;
  const nfe = proc.NFe || proc;
  const inf = nfe.infNFe || nfe;
  const ide = inf.ide || {};
  const emit = inf.emit || {};
  const dest = inf.dest || {};
  const emitEnd = emit.enderEmit || {};
  const destEnd = dest.enderDest || {};
  const tot = inf.total?.ICMSTot || {};
  const transp = inf.transp || {};
  const transporta = transp.transporta || {};
  const veic = transp.veicTransp || {};
  const vol = transp.vol ? (Array.isArray(transp.vol) ? transp.vol[0] : transp.vol) : {};
  const cobr = inf.cobr || {};
  const fat = cobr.fat || {};
  const infAdic = inf.infAdic || {};

  let chNFe = '';
  if (proc.protNFe?.infProt?.chNFe) chNFe = proc.protNFe.infProt.chNFe;
  else if (inf.$?.Id) chNFe = inf.$.Id.replace('NFe', '');

  let nProt = '';
  let dhRecbto = '';
  if (proc.protNFe?.infProt) {
    nProt = gv(proc.protNFe.infProt, 'nProt');
    dhRecbto = gv(proc.protNFe.infProt, 'dhRecbto');
  }

  // Extract products
  const dets = ensureArray(inf.det);
  const products: DanfeProduct[] = dets.map((det: any) => {
    const prod = det.prod || {};
    const imp = det.imposto || {};
    const icms = extractIcmsFromImposto(imp);
    const ipi = extractIpiFromImposto(imp);
    return {
      cProd: gv(prod, 'cProd'),
      xProd: gv(prod, 'xProd'),
      NCM: gv(prod, 'NCM'),
      origCST: icms.orig + icms.cst,
      CFOP: gv(prod, 'CFOP'),
      uCom: gv(prod, 'uCom'),
      qCom: gv(prod, 'qCom'),
      vUnCom: gv(prod, 'vUnCom'),
      vProd: gv(prod, 'vProd'),
      vDesc: gv(prod, 'vDesc') || '0.00',
      vBCICMS: icms.vBC,
      vICMS: icms.vICMS,
      vIPI: ipi.vIPI,
      pICMS: icms.pICMS,
      pIPI: ipi.pIPI,
      infAdProd: gv(det, 'infAdProd'),
    };
  });

  // Extract parcelas
  const dups = ensureArray(cobr.dup);
  const parcelas: DanfeParcela[] = dups.map((d: any) => ({
    nDup: gv(d, 'nDup'),
    dVenc: gv(d, 'dVenc'),
    vDup: gv(d, 'vDup'),
  }));

  // Calc vTotTrib percentage
  const vNF = parseFloat(gv(tot, 'vNF') || '0');
  const vTotTrib = parseFloat(gv(tot, 'vTotTrib') || '0');
  const pTotTrib = vNF > 0 ? ((vTotTrib / vNF) * 100).toFixed(2) : '0.00';

  return {
    chNFe,
    nNF: gv(ide, 'nNF'),
    serie: gv(ide, 'serie'),
    dhEmi: gv(ide, 'dhEmi') || gv(ide, 'dEmi'),
    dhSaiEnt: gv(ide, 'dhSaiEnt') || gv(ide, 'dSaiEnt') || gv(ide, 'dhEmi') || gv(ide, 'dEmi'),
    natOp: gv(ide, 'natOp'),
    tpNF: gv(ide, 'tpNF'),
    nProt,
    dhRecbto,

    emitNome: gv(emit, 'xNome'),
    emitCnpj: gv(emit, 'CNPJ') || gv(emit, 'CPF'),
    emitIE: gv(emit, 'IE'),
    emitIEST: gv(emit, 'IEST') || '',
    emitEnd: [gv(emitEnd, 'xLgr'), gv(emitEnd, 'nro'), gv(emitEnd, 'xCpl')].filter(Boolean).join(', '),
    emitBairro: gv(emitEnd, 'xBairro'),
    emitMun: gv(emitEnd, 'xMun'),
    emitUF: gv(emitEnd, 'UF'),
    emitCEP: gv(emitEnd, 'CEP'),
    emitFone: gv(emitEnd, 'fone'),

    destNome: gv(dest, 'xNome'),
    destCnpj: gv(dest, 'CNPJ') || gv(dest, 'CPF'),
    destIE: gv(dest, 'IE') || '',
    destEnd: [gv(destEnd, 'xLgr'), gv(destEnd, 'nro'), gv(destEnd, 'xCpl')].filter(Boolean).join(', '),
    destBairro: gv(destEnd, 'xBairro'),
    destMun: gv(destEnd, 'xMun'),
    destUF: gv(destEnd, 'UF'),
    destCEP: gv(destEnd, 'CEP'),
    destFone: gv(destEnd, 'fone'),

    vBC: gv(tot, 'vBC') || '0.00',
    vICMS: gv(tot, 'vICMS') || '0.00',
    vBCST: gv(tot, 'vBCST') || '0.00',
    vST: gv(tot, 'vST') || '0.00',
    vProd: gv(tot, 'vProd') || '0.00',
    vFrete: gv(tot, 'vFrete') || '0.00',
    vSeg: gv(tot, 'vSeg') || '0.00',
    vDesc: gv(tot, 'vDesc') || '0.00',
    vOutro: gv(tot, 'vOutro') || '0.00',
    vIPI: gv(tot, 'vIPI') || '0.00',
    vNF: gv(tot, 'vNF') || '0.00',
    vTotTrib: gv(tot, 'vTotTrib') || '0.00',
    pTotTrib,

    products,

    modFrete: gv(transp, 'modFrete'),
    transpNome: gv(transporta, 'xNome'),
    transpCnpj: gv(transporta, 'CNPJ') || gv(transporta, 'CPF'),
    transpIE: gv(transporta, 'IE'),
    transpEnd: gv(transporta, 'xEnder'),
    transpMun: gv(transporta, 'xMun'),
    transpUF: gv(transporta, 'UF'),
    veicPlaca: gv(veic, 'placa'),
    veicUF: gv(veic, 'UF'),
    veicAntt: gv(veic, 'RNTC'),
    volQtd: gv(vol, 'qVol'),
    volEsp: gv(vol, 'esp'),
    volMarca: gv(vol, 'marca'),
    volNum: gv(vol, 'nVol'),
    volPesoB: gv(vol, 'pesoB'),
    volPesoL: gv(vol, 'pesoL'),

    fatNum: gv(fat, 'nFat'),
    fatVOrig: gv(fat, 'vOrig') || '0.00',
    fatVDesc: gv(fat, 'vDesc') || '0.00',
    fatVLiq: gv(fat, 'vLiq') || '0.00',
    parcelas,

    infCpl: gv(infAdic, 'infCpl'),
    infAdFisco: gv(infAdic, 'infAdFisco'),
  };
}

function extractIcmsFromImposto(imp: any): { orig: string; cst: string; vBC: string; vICMS: string; pICMS: string } {
  const icms = imp?.ICMS;
  if (!icms) return { orig: '', cst: '', vBC: '0.00', vICMS: '0.00', pICMS: '0.00' };
  const key = Object.keys(icms).find(k => k.startsWith('ICMS'));
  const g = key ? icms[key] : null;
  if (!g) return { orig: '', cst: '', vBC: '0.00', vICMS: '0.00', pICMS: '0.00' };
  return {
    orig: gv(g, 'orig'),
    cst: gv(g, 'CST') || gv(g, 'CSOSN'),
    vBC: gv(g, 'vBC') || '0.00',
    vICMS: gv(g, 'vICMS') || '0.00',
    pICMS: gv(g, 'pICMS') || '0.00',
  };
}

function extractIpiFromImposto(imp: any): { vIPI: string; pIPI: string } {
  const ipi = imp?.IPI;
  if (!ipi) return { vIPI: '0.00', pIPI: '0.00' };
  const g = ipi.IPITrib || ipi.IPINT;
  if (!g) return { vIPI: '0.00', pIPI: '0.00' };
  return { vIPI: gv(g, 'vIPI') || '0.00', pIPI: gv(g, 'pIPI') || '0.00' };
}

// ==================== CSS ====================

const CSS = `
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

// ==================== HTML Sections ====================

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
      const cols = chunk.map(p => `
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
      // Pad remaining columns if less than 3 parcelas in this row
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
  const rows = d.products.map(p => {
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

// ==================== Main Builder ====================

function buildDanfeHtml(d: DanfeData, autoPrint: boolean): string {
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
  <style>${CSS}</style>
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

// ==================== Fallback for non-NFe ====================

function buildFallbackHtml(
  invoice: { type: string; number: string; series: string | null; issueDate: Date; senderCnpj: string; senderName: string; recipientCnpj: string; recipientName: string; totalValue: number; status: string; accessKey: string; direction: string; company: { razaoSocial: string; cnpj: string } },
  autoPrint: boolean
): string {
  const typeLabel: Record<string, string> = { NFE: 'NF-e', CTE: 'CT-e', NFSE: 'NFS-e' };
  const tl = typeLabel[invoice.type] || invoice.type;
  const now = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${tl} ${invoice.number}</title>
  <style>
    ${CSS}
    .simple-header { background: #333; color: #fff; padding: 15px 20px; }
    .simple-header h1 { font-size: 16px; margin-bottom: 4px; }
    .simple-header p { font-size: 10px; opacity: .8; }
    .simple-body { padding: 15px 20px; }
    .simple-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .simple-card { border: 1px solid #ccc; border-radius: 4px; padding: 10px; }
    .simple-card h3 { font-size: 8px; text-transform: uppercase; color: #666; margin-bottom: 6px; font-weight: bold; }
    .simple-card .name { font-size: 12px; font-weight: bold; }
    .simple-card .cnpj { font-size: 10px; color: #555; font-family: monospace; }
    .simple-total { text-align: center; background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; padding: 12px; margin-bottom: 15px; }
    .simple-total .label { font-size: 9px; text-transform: uppercase; color: #666; }
    .simple-total .value { font-size: 24px; font-weight: bold; }
    .simple-key { border: 1px solid #ccc; border-radius: 4px; padding: 10px; margin-bottom: 15px; }
    .simple-key h3 { font-size: 8px; text-transform: uppercase; color: #666; margin-bottom: 4px; font-weight: bold; }
    .simple-key .val { font-family: monospace; font-size: 10px; word-break: break-all; letter-spacing: .5px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="simple-header">
      <h1>${esc(invoice.company.razaoSocial)}</h1>
      <p>CNPJ: ${fmtCnpj(invoice.company.cnpj)} &mdash; ${tl} N&ordm; ${esc(invoice.number)} / S&eacute;rie ${esc(invoice.series || '1')}</p>
    </div>
    <div class="simple-body">
      <div class="simple-grid">
        <div class="simple-card">
          <h3>Emitente</h3>
          <div class="name">${esc(invoice.senderName)}</div>
          <div class="cnpj">CNPJ: ${fmtCnpj(invoice.senderCnpj)}</div>
        </div>
        <div class="simple-card">
          <h3>Destinat&aacute;rio</h3>
          <div class="name">${esc(invoice.recipientName)}</div>
          <div class="cnpj">CNPJ: ${fmtCnpj(invoice.recipientCnpj)}</div>
        </div>
      </div>
      <div class="simple-total">
        <div class="label">Valor Total</div>
        <div class="value">${fmtCurrency(invoice.totalValue)}</div>
      </div>
      <div class="simple-key">
        <h3>Chave de Acesso</h3>
        <div class="val">${fmtKey(invoice.accessKey)}</div>
      </div>
      <div style="text-align:center; font-size:10px; color:#888; margin-top:20px;">
        Emiss&atilde;o: ${fmtDate(invoice.issueDate.toISOString())}
      </div>
    </div>
    <div class="footer-line" style="padding: 10px 20px;">
      <span>DATA E HORA DA IMPRESS&Atilde;O:${now}</span>
      <span>QLMED - Sistema de Gest&atilde;o Fiscal</span>
    </div>
  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function() { window.print(); });</script>' : ''}
</body>
</html>`;
}

// ==================== Route Handler ====================

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, company: { userId } },
      include: { company: { select: { razaoSocial: true, cnpj: true } } },
    });

    if (!invoice) {
      return new Response('Nota fiscal n\u00e3o encontrada.', { status: 404 });
    }

    const url = new URL(req.url);
    const autoPrint = url.searchParams.get('print') === 'true';
    const download = url.searchParams.get('download') === 'true';

    let html: string;

    try {
      if (invoice.xmlContent && invoice.type === 'NFE') {
        const parsed = await parseXml(invoice.xmlContent);
        const data = extractDanfeData(parsed);
        html = buildDanfeHtml(data, autoPrint);
      } else {
        html = buildFallbackHtml(invoice as any, autoPrint);
      }
    } catch (parseErr) {
      console.error('[PDF] XML parse error, using fallback:', parseErr);
      html = buildFallbackHtml(invoice as any, autoPrint);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
    };

    if (download) {
      const typeLabel: Record<string, string> = { NFE: 'NFe', CTE: 'CTe', NFSE: 'NFSe' };
      const tl = typeLabel[invoice.type] || invoice.type;
      const filename = `DANFE_${tl}_${invoice.number}_${invoice.accessKey.slice(0, 12)}.html`;
      headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    }

    return new Response(html, { headers });
  } catch (error) {
    console.error('[PDF] Internal error:', error);
    return new Response('Erro interno ao gerar documento.', { status: 500 });
  }
}
