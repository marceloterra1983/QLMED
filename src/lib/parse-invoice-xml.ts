import xml2js from 'xml2js';

export interface ParsedInvoice {
  accessKey: string;
  type: 'NFE' | 'CTE';
  number: string;
  series: string;
  issueDate: Date;
  senderCnpj: string;
  senderName: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue: number;
}

const parser = new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

/**
 * Parses NF-e or CT-e XML content and extracts structured invoice data.
 * Used by both SEFAZ and NSDocs sync to ensure consistent data format.
 * Returns null if the XML cannot be parsed or is not a recognized document type.
 */
export async function parseInvoiceXml(xmlContent: string): Promise<ParsedInvoice | null> {
  const result = await parser.parseStringPromise(xmlContent);

  const nfeProc = result.nfeProc;
  const nfe = nfeProc ? nfeProc.NFe : result.NFe;
  const infNFe = nfe ? nfe.infNFe : null;

  const cteProc = result.cteProc;
  const cte = cteProc ? cteProc.CTe : result.CTe;
  const infCte = cte ? cte.infCte : null;

  if (infNFe) {
    let accessKey = infNFe.Id || '';
    if (accessKey.startsWith('NFe')) accessKey = accessKey.substring(3);
    const ide = infNFe.ide;
    const emit = infNFe.emit;
    const dest = infNFe.dest;
    const total = infNFe.total;

    return {
      accessKey,
      type: 'NFE',
      number: ide?.nNF || '',
      series: ide?.serie || '',
      issueDate: ide?.dhEmi ? new Date(ide.dhEmi) : (ide?.dEmi ? new Date(ide.dEmi) : new Date()),
      senderCnpj: emit?.CNPJ || '',
      senderName: emit?.xNome || '',
      recipientCnpj: dest?.CNPJ || '',
      recipientName: dest?.xNome || '',
      totalValue: total?.ICMSTot?.vNF ? Number(total.ICMSTot.vNF) : 0,
    };
  }

  if (infCte) {
    let accessKey = infCte.Id || '';
    if (accessKey.startsWith('CTe')) accessKey = accessKey.substring(3);
    const ide = infCte.ide;
    const emit = infCte.emit;
    const dest = infCte.dest;
    const vPrest = infCte.vPrest;

    return {
      accessKey,
      type: 'CTE',
      number: ide?.nCT || '',
      series: ide?.serie || '',
      issueDate: ide?.dhEmi ? new Date(ide.dhEmi) : new Date(),
      senderCnpj: emit?.CNPJ || '',
      senderName: emit?.xNome || '',
      recipientCnpj: dest?.CNPJ || '',
      recipientName: dest?.xNome || '',
      totalValue: vPrest?.vTPrest ? Number(vPrest.vTPrest) : 0,
    };
  }

  return null;
}
