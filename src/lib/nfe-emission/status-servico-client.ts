import https from 'https';
import { createLogger } from '@/lib/logger';
import { sefazRequestTls } from '@/lib/ssl-verify';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { nfeAutorizacaoUrls, type SefazEnvironment } from './autorizacao-urls';

const log = createLogger('nfe-status-servico');

export type StatusServicoResult = {
  cStat: string;
  xMotivo: string;
  tMed?: string;
  dhRecbto?: string;
  tpAmb?: string;
  cUF?: string;
};

export function assertCertificateReadyForSefaz(cert: { validTo: Date | null } | null): asserts cert is { validTo: Date | null } {
  if (!cert) throw new Error('Certificado digital não configurado');
  if (cert.validTo && cert.validTo.getTime() < Date.now()) {
    throw new Error('Certificado digital vencido');
  }
}

export function buildStatusServicoEnvelope(cUf: string, tpAmb: '1' | '2'): string {
  // NF-e 4.00 (NT 2016.002): sem nfeCabecMsg; nfeDadosMsg é filho direto do Body.
  const cons = `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><cUF>${cUf}</cUF><xServ>STATUS</xServ></consStatServ>`;
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">${cons}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

function findStatus(node: unknown): StatusServicoResult | null {
  if (!node || typeof node !== 'object') return null;
  const rec = node as Record<string, unknown>;
  if (rec.cStat) {
    return {
      cStat: String(rec.cStat),
      xMotivo: rec.xMotivo ? String(rec.xMotivo) : 'Sem motivo',
      tMed: rec.tMed ? String(rec.tMed) : undefined,
      dhRecbto: rec.dhRecbto ? String(rec.dhRecbto) : undefined,
      tpAmb: rec.tpAmb ? String(rec.tpAmb) : undefined,
      cUF: rec.cUF ? String(rec.cUF) : undefined,
    };
  }
  for (const value of Object.values(rec)) {
    const found = findStatus(value);
    if (found) return found;
  }
  return null;
}

export async function parseStatusServicoResponse(xmlResponse: string): Promise<StatusServicoResult> {
  const parsed = await parseXmlSafe(xmlResponse);
  const stat = findStatus(parsed);
  if (!stat?.cStat) {
    throw new Error('Resposta inválida da SEFAZ (status do serviço)');
  }
  return stat;
}

function sendHttps(url: string, envelope: string, certPem: string, keyPem: string): Promise<string> {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(parsed, {
      method: 'POST',
      cert: certPem,
      key: keyPem,
      ...sefazRequestTls(),
      headers: {
        'Content-Type': 'application/soap+xml;charset=utf-8;action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF"',
        'Content-Length': Buffer.byteLength(envelope),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }
        log.error({ statusCode: res.statusCode }, 'SEFAZ status servico HTTP');
        reject(new Error(`SEFAZ HTTP ${res.statusCode}`));
      });
    });
    const timeoutMs = Number(process.env.SEFAZ_TIMEOUT_MS) || 30000;
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`SEFAZ timeout após ${timeoutMs}ms (status do serviço)`));
    });
    req.on('error', reject);
    req.write(envelope);
    req.end();
  });
}

export async function consultarStatusServico(input: {
  cUf: string;
  environment: SefazEnvironment;
  certPem: string;
  keyPem: string;
}): Promise<StatusServicoResult> {
  const urls = nfeAutorizacaoUrls(input.cUf, input.environment);
  const tpAmb = input.environment === 'production' ? '1' : '2';
  const envelope = buildStatusServicoEnvelope(input.cUf, tpAmb);
  const xmlResponse = await sendHttps(urls.statusServico, envelope, input.certPem, input.keyPem);
  return parseStatusServicoResponse(xmlResponse);
}
