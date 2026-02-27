import { parseXmlSafe } from '@/lib/safe-xml-parser';

export interface ParsedInvoice {
  accessKey: string;
  type: 'NFE' | 'CTE' | 'NFSE';
  number: string;
  series: string;
  issueDate: Date;
  senderCnpj: string;
  senderName: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue: number;
}

type PartyInfo = {
  cnpj: string;
  name: string;
};

function extractAccessKey(proc: any, inf: any, prefix: string): string {
  // 1. From protocoled response (most reliable)
  const protKey = prefix === 'NFe' ? 'protNFe' : 'protCTe';
  const chKey = prefix === 'NFe' ? 'chNFe' : 'chCTe';
  const chave = proc?.[protKey]?.infProt?.[chKey];
  if (chave && chave.length >= 44) return chave;

  // 2. From infNFe/infCte Id attribute
  const id = inf?.Id || '';
  if (id) {
    const clean = id.replace(/^(NFe|CTe)/, '');
    if (clean.length >= 44) return clean;
  }

  return '';
}

function getPartyInfo(node: any): PartyInfo {
  return {
    cnpj: node?.CNPJ || node?.CPF || '',
    name: node?.xNome || node?.xFant || '',
  };
}

function hasPartyInfo(party: PartyInfo): boolean {
  return Boolean((party.cnpj || '').trim() || (party.name || '').trim());
}

function extractCteTomador(infCte: any): PartyInfo {
  const ide = infCte?.ide || {};
  const rem = getPartyInfo(infCte?.rem || {});
  const exped = getPartyInfo(infCte?.exped || {});
  const receb = getPartyInfo(infCte?.receb || {});
  const dest = getPartyInfo(infCte?.dest || {});

  const toma4 = ide?.toma4 || infCte?.toma4 || infCte?.infCteNorm?.toma4 || {};
  const toma4Tom = getPartyInfo(toma4?.toma || {});
  const toma4Direct = getPartyInfo(toma4 || {});
  const ideToma = getPartyInfo(ide?.toma || {});
  const infToma = getPartyInfo(infCte?.toma || {});

  const explicitTomador = hasPartyInfo(toma4Tom)
    ? toma4Tom
    : hasPartyInfo(toma4Direct)
      ? toma4Direct
      : hasPartyInfo(ideToma)
        ? ideToma
        : hasPartyInfo(infToma)
          ? infToma
          : null;

  const toma3Raw = ide?.toma3;
  const toma03Raw = ide?.toma03;
  const toma3Code = typeof toma3Raw === 'object' ? toma3Raw?.toma : toma3Raw;
  const toma03Code = typeof toma03Raw === 'object' ? toma03Raw?.toma : toma03Raw;
  const tpTomRaw = String(toma4?.tpTom ?? toma03Code ?? toma3Code ?? ide?.tpTom ?? '').trim();

  const byCode: Record<string, PartyInfo> = {
    '0': rem,
    '1': exped,
    '2': receb,
    '3': dest,
  };

  if (tpTomRaw in byCode && hasPartyInfo(byCode[tpTomRaw])) {
    return byCode[tpTomRaw];
  }

  if (tpTomRaw === '4' && explicitTomador && hasPartyInfo(explicitTomador)) {
    return explicitTomador;
  }

  if (explicitTomador && hasPartyInfo(explicitTomador)) {
    return explicitTomador;
  }

  if (hasPartyInfo(dest)) return dest;
  if (hasPartyInfo(rem)) return rem;
  if (hasPartyInfo(receb)) return receb;
  if (hasPartyInfo(exped)) return exped;

  return { cnpj: '', name: '' };
}

function parseNFe(result: any): ParsedInvoice | null {
  const nfeProc = result.nfeProc || result;
  const nfe = nfeProc?.NFe || result.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) return null;

  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const dest = infNFe.dest || {};
  const total = infNFe.total;

  const accessKey = extractAccessKey(nfeProc, infNFe, 'NFe');
  if (!accessKey) return null;

  return {
    accessKey,
    type: 'NFE',
    number: ide.nNF || '',
    series: ide.serie || '',
    issueDate: ide.dhEmi ? new Date(ide.dhEmi) : (ide.dEmi ? new Date(ide.dEmi) : new Date()),
    senderCnpj: emit.CNPJ || emit.CPF || '',
    senderName: emit.xNome || '',
    recipientCnpj: dest.CNPJ || dest.CPF || '',
    recipientName: dest.xNome || '',
    totalValue: total?.ICMSTot?.vNF ? Number(total.ICMSTot.vNF) : 0,
  };
}

function parseCTe(result: any): ParsedInvoice | null {
  const cteProc = result.cteProc || result;
  const cte = cteProc?.CTe || result.CTe;
  const infCte = cte?.infCte;
  if (!infCte) return null;

  const ide = infCte.ide || {};
  const emit = infCte.emit || {};
  const vPrest = infCte.vPrest || {};
  const tomador = extractCteTomador(infCte);

  const accessKey = extractAccessKey(cteProc, infCte, 'CTe');
  if (!accessKey) return null;

  return {
    accessKey,
    type: 'CTE',
    number: ide.nCT || '',
    series: ide.serie || '',
    issueDate: ide.dhEmi ? new Date(ide.dhEmi) : new Date(),
    senderCnpj: emit.CNPJ || emit.CPF || '',
    senderName: emit.xNome || '',
    recipientCnpj: tomador.cnpj,
    recipientName: tomador.name,
    totalValue: vPrest.vTPrest ? Number(vPrest.vTPrest) : 0,
  };
}

function parseNFSe(result: any): ParsedInvoice | null {
  // NFS-e pode vir em diferentes schemas (ABRASF, Ginfes, padrão nacional ADN etc.)
  const nfseNacional = result?.NFSe?.infNFSe || result?.infNFSe;
  if (nfseNacional) {
    const dps = nfseNacional.DPS?.infDPS || {};
    const toma = dps.toma || {};
    const emit = nfseNacional.emit || dps.prest || {};
    const totalValueRaw = nfseNacional.valores?.vLiq
      || dps.valores?.vServPrest?.vServ
      || dps.valores?.vServPrest?.vLiq
      || dps.valores?.vServPrest?.vServPrest;

    const accessKeyFromId = String(nfseNacional.Id || dps.Id || '')
      .replace(/^NFS/i, '')
      .replace(/^DPS/i, '');

    return {
      accessKey: accessKeyFromId || `NFSE-${String(nfseNacional.nNFSe || dps.nDPS || '')}`,
      type: 'NFSE',
      number: String(nfseNacional.nNFSe || dps.nDPS || ''),
      series: String(dps.serie || ''),
      issueDate: dps.dhEmi ? new Date(dps.dhEmi) : (nfseNacional.dhProc ? new Date(nfseNacional.dhProc) : new Date()),
      senderCnpj: String(emit.CNPJ || emit.CPF || ''),
      senderName: String(emit.xNome || ''),
      recipientCnpj: String(toma.CNPJ || toma.CPF || ''),
      recipientName: String(toma.xNome || ''),
      totalValue: totalValueRaw ? Number(totalValueRaw) : 0,
    };
  }

  // Schemas ABRASF/municipais
  const compNfse = result.CompNfse || result.ConsultarNfseResposta?.ListaNfse?.CompNfse;
  const nfse = compNfse?.Nfse?.InfNfse || result.Nfse?.InfNfse || result.InfNfse;
  if (!nfse) return null;

  const servico = nfse.Servico || {};
  const prestador = nfse.PrestadorServico || nfse.Prestador || {};
  const tomador = nfse.TomadorServico || nfse.Tomador || {};
  const idPrestador = prestador.IdentificacaoPrestador || {};
  const idTomador = tomador.IdentificacaoTomador || {};

  const numero = nfse.Numero || '';
  const accessKey = nfse.CodigoVerificacao
    ? `NFSE${(idPrestador.CpfCnpj?.Cnpj || idPrestador.Cnpj || '').padStart(14, '0')}${numero.padStart(15, '0')}${nfse.CodigoVerificacao}`
    : '';
  if (!accessKey || accessKey.length < 20) return null;

  return {
    accessKey,
    type: 'NFSE',
    number: numero,
    series: '',
    issueDate: nfse.DataEmissao ? new Date(nfse.DataEmissao) : new Date(),
    senderCnpj: idPrestador.CpfCnpj?.Cnpj || idPrestador.Cnpj || '',
    senderName: prestador.RazaoSocial || prestador.NomeFantasia || '',
    recipientCnpj: idTomador.CpfCnpj?.Cnpj || idTomador.Cnpj || '',
    recipientName: tomador.RazaoSocial || tomador.NomeFantasia || '',
    totalValue: servico.Valores?.ValorServicos ? Number(servico.Valores.ValorServicos) : (servico.ValorServicos ? Number(servico.ValorServicos) : 0),
  };
}

// ── Fiscal party data (IE, IM, CRT, UF) ──

export interface PartyFiscalData {
  cnpj: string;
  ie: string | null;
  im: string | null;
  crt: string | null;
  uf: string | null;
}

/**
 * Extract fiscal data (IE, IM, CRT, UF) from emitter or recipient in NF-e XML.
 */
export async function extractPartyFiscalData(
  xmlContent: string,
  party: 'emit' | 'dest',
): Promise<PartyFiscalData | null> {
  try {
    const result = await parseXmlSafe(xmlContent);
    const nfeProc = result?.nfeProc || result;
    const nfe = nfeProc?.NFe || result?.NFe;
    const infNFe = nfe?.infNFe;
    if (!infNFe) return null;

    const node = infNFe[party];
    if (!node) return null;

    const cnpj = (node.CNPJ || node.CPF || '').trim();
    if (!cnpj) return null;

    const enderNode = node[party === 'emit' ? 'enderEmit' : 'enderDest'] || {};

    return {
      cnpj,
      ie: node.IE ? String(node.IE).trim() || null : null,
      im: node.IM ? String(node.IM).trim() || null : null,
      crt: node.CRT ? String(node.CRT).trim() || null : null,
      uf: enderNode.UF ? String(enderNode.UF).trim() || null : null,
    };
  } catch {
    return null;
  }
}

/**
 * Parses NF-e, CT-e or NFS-e XML content and extracts structured invoice data.
 * Returns null if the XML cannot be parsed or is not a recognized document type.
 */
export async function parseInvoiceXml(xmlContent: string): Promise<ParsedInvoice | null> {
  const result = await parseXmlSafe(xmlContent);

  // Try NF-e first (most common)
  const nfe = parseNFe(result);
  if (nfe) return nfe;

  // Try CT-e
  const cte = parseCTe(result);
  if (cte) return cte;

  // Try NFS-e
  const nfse = parseNFSe(result);
  if (nfse) return nfse;

  return null;
}
