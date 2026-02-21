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
  const dest = infCte.dest || {};
  const vPrest = infCte.vPrest || {};

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
    recipientCnpj: dest.CNPJ || dest.CPF || '',
    recipientName: dest.xNome || '',
    totalValue: vPrest.vTPrest ? Number(vPrest.vTPrest) : 0,
  };
}

function parseNFSe(result: any): ParsedInvoice | null {
  // NFS-e pode vir em diferentes schemas (ABRASF, Ginfes, etc.)
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
