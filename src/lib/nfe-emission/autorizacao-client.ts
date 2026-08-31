import https from 'https';
import { createLogger } from '@/lib/logger';
import { sefazRequestTls } from '@/lib/ssl-verify';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { nfeAutorizacaoUrls, type SefazEnvironment } from './autorizacao-urls';

const log = createLogger('nfe-autorizacao');

export type AutorizacaoResult = {
  cStat: string;
  xMotivo: string;
  nProt?: string;
  dhRecbto?: string;
  xmlAutorizado?: string;
};

function soapEnvelope(body: string): string {
  // NF-e 4.00 (NT 2016.002): sem nfeCabecMsg; nfeDadosMsg é filho direto do Body.
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${body}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
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
        'Content-Type': 'application/soap+xml;charset=utf-8;action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote"',
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
        log.error({ statusCode: res.statusCode }, 'SEFAZ autorizacao HTTP');
        reject(new Error(`SEFAZ HTTP ${res.statusCode}`));
      });
    });
    const timeoutMs = Number(process.env.SEFAZ_TIMEOUT_MS) || 30000;
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`SEFAZ timeout após ${timeoutMs}ms (autorização)`));
    });
    req.on('error', reject);
    req.write(envelope);
    req.end();
  });
}

function findStat(node: unknown): { cStat?: string; xMotivo?: string; nProt?: string; dhRecbto?: string } {
  if (!node || typeof node !== 'object') return {};
  const rec = node as Record<string, unknown>;
  if (rec.cStat || rec.xMotivo) {
    return {
      cStat: rec.cStat ? String(rec.cStat) : undefined,
      xMotivo: rec.xMotivo ? String(rec.xMotivo) : undefined,
      nProt: rec.nProt ? String(rec.nProt) : undefined,
      dhRecbto: rec.dhRecbto ? String(rec.dhRecbto) : undefined,
    };
  }
  for (const value of Object.values(rec)) {
    const found = findStat(value);
    if (found.cStat) return found;
  }
  return {};
}

export async function enviarNfeAutorizacao(input: {
  signedNfeXml: string;
  cUf: string;
  environment: SefazEnvironment;
  certPem: string;
  keyPem: string;
  idLote: string;
}): Promise<AutorizacaoResult> {
  const urls = nfeAutorizacaoUrls(input.cUf, input.environment);
  const enviNFe = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${input.idLote}</idLote><indSinc>1</indSinc>${input.signedNfeXml}</enviNFe>`;
  const xmlResponse = await sendHttps(
    urls.autorizacao,
    soapEnvelope(enviNFe),
    input.certPem,
    input.keyPem,
  );
  const parsed = await parseXmlSafe(xmlResponse);
  const stat = findStat(parsed);
  if (!stat.cStat) {
    throw new Error('Resposta inválida da SEFAZ (autorização)');
  }
  const authorized = stat.cStat === '100' || stat.cStat === '150';
  if (!authorized) {
    return { cStat: stat.cStat, xMotivo: stat.xMotivo || 'Rejeição SEFAZ' };
  }
  const prot = `<protNFe versao="4.00"><infProt><tpAmb>${input.environment === 'production' ? '1' : '2'}</tpAmb><chNFe></chNFe><dhRecbto>${stat.dhRecbto || ''}</dhRecbto><nProt>${stat.nProt || ''}</nProt><digVal></digVal><cStat>${stat.cStat}</cStat><xMotivo>${stat.xMotivo || ''}</xMotivo></infProt></protNFe>`;
  const xmlAutorizado = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${input.signedNfeXml}${prot}</nfeProc>`;
  return {
    cStat: stat.cStat,
    xMotivo: stat.xMotivo || 'Autorizado o uso da NF-e',
    nProt: stat.nProt,
    dhRecbto: stat.dhRecbto,
    xmlAutorizado,
  };
}
