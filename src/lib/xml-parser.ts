import { parseString } from 'xml2js';

export interface ParsedInvoice {
  accessKey: string;
  type: 'NFE' | 'CTE' | 'NFSE';
  number: string;
  series: string;
  issueDate: string;
  senderCnpj: string;
  senderName: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue: number;
}

function parseXmlPromise(xml: string): Promise<any> {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false, trim: true }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function getNestedValue(obj: any, ...paths: string[]): string {
  for (const path of paths) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      value = value?.[key];
    }
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }
  return '';
}

export async function parseNFeXml(xmlContent: string): Promise<ParsedInvoice> {
  const parsed = await parseXmlPromise(xmlContent);
  
  // NFe structure: nfeProc > NFe > infNFe
  const nfeProc = parsed.nfeProc || parsed.NFe || parsed;
  const nfe = nfeProc.NFe || nfeProc;
  const infNFe = nfe.infNFe || nfe;
  
  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const dest = infNFe.dest || {};
  const total = infNFe.total?.ICMSTot || infNFe.total || {};
  
  // Access key from protNFe or infNFe attribute
  let accessKey = '';
  if (nfeProc.protNFe?.infProt?.chNFe) {
    accessKey = nfeProc.protNFe.infProt.chNFe;
  } else if (infNFe.$?.Id) {
    accessKey = infNFe.$.Id.replace('NFe', '');
  }

  // Determine type
  let type: 'NFE' | 'CTE' | 'NFSE' = 'NFE';
  if (parsed.cteProc || parsed.CTe) {
    type = 'CTE';
  }

  return {
    accessKey: accessKey || `MANUAL_${Date.now()}`,
    type,
    number: getNestedValue(ide, 'nNF', 'nCT') || '0',
    series: getNestedValue(ide, 'serie') || '1',
    issueDate: getNestedValue(ide, 'dhEmi', 'dEmi') || new Date().toISOString(),
    senderCnpj: getNestedValue(emit, 'CNPJ', 'CPF') || '',
    senderName: getNestedValue(emit, 'xNome') || 'Emitente não identificado',
    recipientCnpj: getNestedValue(dest, 'CNPJ', 'CPF') || '',
    recipientName: getNestedValue(dest, 'xNome') || 'Destinatário não identificado',
    totalValue: parseFloat(getNestedValue(total, 'vNF', 'vPrest.vTPrest') || '0'),
  };
}

export async function parseCTeXml(xmlContent: string): Promise<ParsedInvoice> {
  const parsed = await parseXmlPromise(xmlContent);
  
  const cteProc = parsed.cteProc || parsed.CTe || parsed;
  const cte = cteProc.CTe || cteProc;
  const infCte = cte.infCte || cte;
  
  const ide = infCte.ide || {};
  const emit = infCte.emit || {};
  const dest = infCte.dest || {};
  const vPrest = infCte.vPrest || {};

  let accessKey = '';
  if (cteProc.protCTe?.infProt?.chCTe) {
    accessKey = cteProc.protCTe.infProt.chCTe;
  } else if (infCte.$?.Id) {
    accessKey = infCte.$.Id.replace('CTe', '');
  }

  return {
    accessKey: accessKey || `MANUAL_${Date.now()}`,
    type: 'CTE',
    number: getNestedValue(ide, 'nCT') || '0',
    series: getNestedValue(ide, 'serie') || '1',
    issueDate: getNestedValue(ide, 'dhEmi', 'dEmi') || new Date().toISOString(),
    senderCnpj: getNestedValue(emit, 'CNPJ') || '',
    senderName: getNestedValue(emit, 'xNome') || 'Emitente não identificado',
    recipientCnpj: getNestedValue(dest, 'CNPJ') || '',
    recipientName: getNestedValue(dest, 'xNome') || 'Destinatário não identificado',
    totalValue: parseFloat(getNestedValue(vPrest, 'vTPrest') || '0'),
  };
}

export async function parseInvoiceXml(xmlContent: string): Promise<ParsedInvoice> {
  // Detect type from XML content
  if (xmlContent.includes('cteProc') || xmlContent.includes('<CTe')) {
    return parseCTeXml(xmlContent);
  }
  return parseNFeXml(xmlContent);
}
