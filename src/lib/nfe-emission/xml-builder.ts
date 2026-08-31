import { addMoney, formatMoneyDecimal, sumMoney } from '@/lib/money';
import { Decimal } from '@prisma/client-runtime-utils';
import { UF_TO_CODE } from '@/lib/constants';
import { idDestFromUfs } from './operations';
import {
  DEFAULT_COFINS_ALIQUOTA,
  DEFAULT_ICMS_CST_ISENTO,
  DEFAULT_MOD_FRETE,
  DEFAULT_PIS_ALIQUOTA,
  DEFAULT_PIS_CST,
  defaultPagFor,
  isPisNaoTributado,
} from './issued-defaults';
import type { NfeEmissionDraft, NfeEmissionItem } from './types';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: string | number): string {
  return formatMoneyDecimal(new Decimal(value));
}

function qty(value: string): string {
  return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

function itemGross(item: NfeEmissionItem): number {
  const gross = new Decimal(item.qCom).mul(item.vUnCom).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const desc = item.vDesc ? new Decimal(item.vDesc) : new Decimal(0);
  return gross.minus(desc).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function draftTotalValue(items: NfeEmissionItem[]): string {
  return formatMoneyDecimal(new Decimal(sumMoney(items.map(itemGross))));
}

export function draftDocumentTotal(
  items: NfeEmissionItem[],
  extras: { vFrete?: string; vSeg?: string; vOutro?: string } = {},
): string {
  return formatMoneyDecimal(
    new Decimal(draftTotalValue(items))
      .plus(extras.vFrete || 0)
      .plus(extras.vSeg || 0)
      .plus(extras.vOutro || 0),
  );
}

function isoOffset(date: Date): string {
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const hours = Math.floor(Math.abs(tz) / 60);
  const mins = Math.abs(tz) % 60;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return `${local.toISOString().slice(0, 19)}${sign}${pad(hours)}:${pad(mins)}`;
}

function enderXml(tag: 'enderEmit' | 'enderDest', ender: NfeEmissionDraft['emit']['ender']): string {
  const cpl = ender.xCpl ? `<xCpl>${esc(ender.xCpl)}</xCpl>` : '';
  return `<${tag}><xLgr>${esc(ender.xLgr)}</xLgr><nro>${esc(ender.nro)}</nro>${cpl}<xBairro>${esc(ender.xBairro)}</xBairro><cMun>${esc(ender.cMun)}</cMun><xMun>${esc(ender.xMun)}</xMun><UF>${esc(ender.UF)}</UF><CEP>${esc(ender.CEP.replace(/\D/g, ''))}</CEP><cPais>1058</cPais><xPais>Brasil</xPais></${tag}>`;
}

function icmsXml(item: NfeEmissionItem, crt: string, vProd: string): string {
  const orig = item.orig || '0';
  if (crt === '1' || crt === '2') {
    const csosn = item.csosn || '102';
    return `<ICMS><ICMSSN102><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN102></ICMS>`;
  }
  const rate = item.pIcms ? Number(item.pIcms) : 0;
  if (!rate) {
    const cst = item.cstIcms || DEFAULT_ICMS_CST_ISENTO;
    return `<ICMS><ICMS40><orig>${orig}</orig><CST>${esc(cst)}</CST></ICMS40></ICMS>`;
  }
  const vBc = vProd;
  const vIcms = money(new Decimal(vBc).mul(rate).div(100).toNumber());
  return `<ICMS><ICMS00><orig>${orig}</orig><CST>${item.cstIcms || '00'}</CST><modBC>3</modBC><vBC>${vBc}</vBC><pICMS>${money(rate)}</pICMS><vICMS>${vIcms}</vICMS></ICMS00></ICMS>`;
}

function aliquot4(value: string): string {
  return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

function itemPisCofins(item: NfeEmissionItem, vBc: string): {
  xml: string;
  vPis: number;
  vCofins: number;
} {
  const cstPis = item.cstPis || DEFAULT_PIS_CST;
  const cstCofins = item.cstCofins || cstPis;
  if (isPisNaoTributado(cstPis)) {
    return {
      xml: `<PIS><PISNT><CST>${esc(cstPis)}</CST></PISNT></PIS><COFINS><COFINSNT><CST>${esc(cstCofins)}</CST></COFINSNT></COFINS>`,
      vPis: 0,
      vCofins: 0,
    };
  }
  const pPis = aliquot4(item.pPis || DEFAULT_PIS_ALIQUOTA);
  const pCofins = aliquot4(item.pCofins || DEFAULT_COFINS_ALIQUOTA);
  const vPis = money(new Decimal(vBc).mul(pPis).div(100).toNumber());
  const vCofins = money(new Decimal(vBc).mul(pCofins).div(100).toNumber());
  return {
    xml: `<PIS><PISAliq><CST>${esc(cstPis)}</CST><vBC>${vBc}</vBC><pPIS>${pPis}</pPIS><vPIS>${vPis}</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>${esc(cstCofins)}</CST><vBC>${vBc}</vBC><pCOFINS>${pCofins}</pCOFINS><vCOFINS>${vCofins}</vCOFINS></COFINSAliq></COFINS>`,
    vPis: Number(vPis),
    vCofins: Number(vCofins),
  };
}

function detXml(item: NfeEmissionItem, nItem: number, crt: string): { xml: string; vPis: number; vCofins: number } {
  const vProd = money(new Decimal(item.qCom).mul(item.vUnCom).toNumber());
  const vDescAmt = item.vDesc && Number(item.vDesc) > 0 ? money(item.vDesc) : '';
  const vDesc = vDescAmt ? `<vDesc>${vDescAmt}</vDesc>` : '';
  const vBc = money(new Decimal(vProd).minus(vDescAmt || 0).toNumber());
  const pis = itemPisCofins(item, vBc);
  const ean = item.ean && item.ean !== 'SEM GTIN' ? esc(item.ean) : 'SEM GTIN';
  const cest = item.cest ? `<CEST>${esc(item.cest)}</CEST>` : '';
  const med = item.anvisa
    ? `<med><cProdANVISA>${esc(item.anvisa)}</cProdANVISA></med>`
    : '';
  return {
    xml: `<det nItem="${nItem}"><prod><cProd>${esc(item.cProd)}</cProd><cEAN>${ean}</cEAN><xProd>${esc(item.xProd)}</xProd><NCM>${esc(item.ncm)}</NCM>${cest}<CFOP>${esc(item.cfop)}</CFOP><uCom>${esc(item.uCom)}</uCom><qCom>${qty(item.qCom)}</qCom><vUnCom>${money(item.vUnCom)}</vUnCom><vProd>${vProd}</vProd><cEANTrib>${ean}</cEANTrib><uTrib>${esc(item.uCom)}</uTrib><qTrib>${qty(item.qCom)}</qTrib><vUnTrib>${money(item.vUnCom)}</vUnTrib>${vDesc}<indTot>1</indTot>${med}</prod><imposto>${icmsXml(item, crt, vProd)}${pis.xml}</imposto></det>`,
    vPis: pis.vPis,
    vCofins: pis.vCofins,
  };
}

function transpXml(draft: NfeEmissionDraft): string {
  const mod = draft.modFrete || DEFAULT_MOD_FRETE;
  const t = draft.transporta;
  const transporta = t?.xNome
    ? `<transporta>${t.cnpj ? `<CNPJ>${esc(t.cnpj.replace(/\D/g, ''))}</CNPJ>` : ''}<xNome>${esc(t.xNome)}</xNome>${t.ie ? `<IE>${esc(t.ie)}</IE>` : ''}${t.xEnder ? `<xEnder>${esc(t.xEnder)}</xEnder>` : ''}${t.xMun ? `<xMun>${esc(t.xMun)}</xMun>` : ''}${t.UF ? `<UF>${esc(t.UF)}</UF>` : ''}</transporta>`
    : '';
  const v = draft.volume;
  const vol = v && (v.qVol || v.esp || v.pesoB)
    ? `<vol>${v.qVol ? `<qVol>${esc(v.qVol)}</qVol>` : ''}${v.esp ? `<esp>${esc(v.esp)}</esp>` : ''}${v.marca ? `<marca>${esc(v.marca)}</marca>` : ''}${v.pesoL ? `<pesoL>${qty(v.pesoL)}</pesoL>` : ''}${v.pesoB ? `<pesoB>${qty(v.pesoB)}</pesoB>` : ''}</vol>`
    : '';
  return `<transp><modFrete>${esc(mod)}</modFrete>${transporta}${vol}</transp>`;
}

function resolvedPag(draft: NfeEmissionDraft, vNf: string): { tPag: string; indPag: string; vPag: string } {
  const fallback = defaultPagFor(draft.finNFe || '1', draft.cfop);
  const tPag = draft.pag?.tPag || fallback.tPag;
  const indPag = draft.pag?.indPag || fallback.indPag;
  const vPag = tPag === '90' ? '0.00' : money(draft.pag?.vPag || vNf);
  return { tPag, indPag, vPag };
}

function pagXml(draft: NfeEmissionDraft, vNf: string): string {
  const { tPag, indPag, vPag } = resolvedPag(draft, vNf);
  return `<pag><detPag><indPag>${indPag}</indPag><tPag>${esc(tPag)}</tPag><vPag>${vPag}</vPag></detPag></pag>`;
}

function isoDate(date: Date, plusDays = 0): string {
  const d = new Date(date.getTime() + plusDays * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function cobrXml(draft: NfeEmissionDraft, vNf: string): string {
  const { tPag } = resolvedPag(draft, vNf);
  if (tPag === '90') return '';
  const nFat = String(Number(draft.number) || draft.number).padStart(9, '0');
  return `<cobr><fat><nFat>${esc(nFat)}</nFat><vOrig>${vNf}</vOrig><vLiq>${vNf}</vLiq></fat><dup><nDup>001</nDup><dVenc>${isoDate(draft.issueDate, 30)}</dVenc><vDup>${vNf}</vDup></dup></cobr>`;
}

function infAdicXml(draft: NfeEmissionDraft): string {
  if (!draft.infCpl && !draft.infAdFisco) return '';
  const fisco = draft.infAdFisco ? `<infAdFisco>${esc(draft.infAdFisco)}</infAdFisco>` : '';
  const cpl = draft.infCpl ? `<infCpl>${esc(draft.infCpl)}</infCpl>` : '';
  return `<infAdic>${fisco}${cpl}</infAdic>`;
}

export function buildUnsignedNfeXml(draft: NfeEmissionDraft): string {
  if (draft.items.length === 0) throw new Error('A nota precisa de pelo menos um item');
  const cUf = UF_TO_CODE[draft.emit.ender.UF];
  if (!cUf) throw new Error('UF do emitente sem código IBGE');
  const vProd = draft.items.reduce((sum, item) => addMoney(sum, Number(money(new Decimal(item.qCom).mul(item.vUnCom).toNumber()))), 0);
  const vDesc = draft.items.reduce((sum, item) => addMoney(sum, item.vDesc ? Number(money(item.vDesc)) : 0), 0);
  const vFrete = money(draft.vFrete || 0);
  const vSeg = money(draft.vSeg || 0);
  const vOutro = money(draft.vOutro || 0);
  const vNf = money(addMoney(addMoney(addMoney(addMoney(vProd, -vDesc), Number(vFrete)), Number(vSeg)), Number(vOutro)));
  const dhEmi = isoOffset(draft.issueDate);
  const destNome = draft.tpAmb === '2'
    ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
    : draft.dest.xNome;
  const destIe = draft.dest.indIEDest === '1' && draft.dest.ie
    ? `<IE>${esc(draft.dest.ie.replace(/\D/g, ''))}</IE>`
    : '';
  const dets = draft.items.map((item, i) => detXml({ ...item, cfop: item.cfop || draft.cfop }, i + 1, draft.emit.crt));
  const vPis = money(sumMoney(dets.map((row) => row.vPis)));
  const vCofins = money(sumMoney(dets.map((row) => row.vCofins)));
  const finNFe = draft.finNFe || '1';
  const infNFe = `<infNFe xmlns="http://www.portalfiscal.inf.br/nfe" Id="NFe${draft.accessKey}" versao="4.00"><ide><cUF>${cUf}</cUF><cNF>${draft.accessKey.slice(35, 43)}</cNF><natOp>${esc(draft.natureza)}</natOp><mod>55</mod><serie>${Number(draft.series)}</serie><nNF>${Number(draft.number)}</nNF><dhEmi>${dhEmi}</dhEmi><tpNF>1</tpNF><idDest>${idDestFromUfs(draft.emit.ender.UF, draft.dest.ender.UF)}</idDest><cMunFG>${esc(draft.emit.ender.cMun)}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${draft.accessKey.slice(-1)}</cDV><tpAmb>${draft.tpAmb}</tpAmb><finNFe>${finNFe}</finNFe><indFinal>${draft.indFinal}</indFinal><indPres>${esc(draft.indPres)}</indPres><procEmi>0</procEmi><verProc>QLMED</verProc></ide><emit><CNPJ>${esc(draft.emit.cnpj)}</CNPJ><xNome>${esc(draft.emit.xNome)}</xNome>${draft.emit.xFant ? `<xFant>${esc(draft.emit.xFant)}</xFant>` : ''}${enderXml('enderEmit', draft.emit.ender)}<IE>${esc(draft.emit.ie.replace(/\D/g, ''))}</IE><CRT>${esc(draft.emit.crt)}</CRT></emit><dest><CNPJ>${esc(draft.dest.cnpj)}</CNPJ><xNome>${esc(destNome)}</xNome>${enderXml('enderDest', draft.dest.ender)}<indIEDest>${draft.dest.indIEDest}</indIEDest>${destIe}</dest>${dets.map((row) => row.xml).join('')}<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${money(vProd)}</vProd><vFrete>${vFrete}</vFrete><vSeg>${vSeg}</vSeg><vDesc>${money(vDesc)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>${vPis}</vPIS><vCOFINS>${vCofins}</vCOFINS><vOutro>${vOutro}</vOutro><vNF>${vNf}</vNF></ICMSTot></total>${transpXml(draft)}${cobrXml(draft, vNf)}${pagXml(draft, vNf)}${infAdicXml(draft)}</infNFe>`;
  return `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${infNFe}</NFe>`;
}
