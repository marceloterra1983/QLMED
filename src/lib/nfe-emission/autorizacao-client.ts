import https from 'https';
import { createLogger } from '@/lib/logger';
import { sefazRequestTls } from '@/lib/ssl-verify';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { nfeAutorizacaoUrls, type SefazEnvironment } from './autorizacao-urls';

const log = createLogger('nfe-autorizacao');

/**
 * `authorized` e `rejected` são respostas definitivas da SEFAZ sobre ESTA NF-e.
 * `pending` é tudo que não decide: lote recebido para processamento assíncrono
 * (cStat 103), resposta sem protNFe, qualquer coisa que não permita afirmar que
 * a nota não foi autorizada. Quem chama nunca pode tratar `pending` como
 * rejeição — o número e a chave continuam em uso até a consulta de protocolo
 * dizer o contrário.
 */
export type AutorizacaoOutcome = 'authorized' | 'rejected' | 'pending';

export type AutorizacaoResult = {
  outcome: AutorizacaoOutcome;
  cStat: string;
  xMotivo: string;
  nProt?: string;
  dhRecbto?: string;
  digVal?: string;
  xmlAutorizado?: string;
};

/** Resposta do NFeConsultaProtocolo. `absent` = a SEFAZ não conhece a chave. */
export type ConsultaOutcome = 'authorized' | 'rejected' | 'absent' | 'unknown';

export type ConsultaResult = {
  outcome: ConsultaOutcome;
  cStat: string;
  xMotivo: string;
  nProt?: string;
  dhRecbto?: string;
  digVal?: string;
  protNFe?: string;
};

const AUTHORIZED_STAT = new Set(['100', '150']);
/** Denegada: a SEFAZ decidiu, a nota não vale, e a chave fica queimada. */
const DENIED_STAT = new Set(['110', '301', '302', '303']);

/**
 * Denegação consome número e chave; rejeição comum não. Quem trata o desfecho
 * precisa da distinção, senão devolve ao pool um número já queimado.
 */
export function isDeniedStat(cStat: string | undefined): boolean {
  return Boolean(cStat && DENIED_STAT.has(cStat));
}
/** Lote aceito para processamento — não diz nada sobre a nota. */
const BATCH_ACCEPTED_STAT = new Set(['103', '104']);

function soapEnvelope(service: string, body: string): string {
  // NF-e 4.00 (NT 2016.002): sem nfeCabecMsg; nfeDadosMsg é filho direto do Body.
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${service}">${body}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

function sendHttps(
  url: string,
  envelope: string,
  certPem: string,
  keyPem: string,
  soapAction: string,
): Promise<string> {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(parsed, {
      method: 'POST',
      cert: certPem,
      key: keyPem,
      ...sefazRequestTls(parsed.host),
      headers: {
        'Content-Type': `application/soap+xml;charset=utf-8;action="${soapAction}"`,
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

/**
 * Primeiro nó com este nome, em qualquer profundidade. A DFS antiga procurava
 * `cStat` solto e casava com o cStat do LOTE (103/104), lendo "lote recebido"
 * como rejeição da nota — QLMED-FISCAL-004.
 */
function findNode(node: unknown, name: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNode(item, name);
      if (found) return found;
    }
    return null;
  }
  const rec = node as Record<string, unknown>;
  const direct = rec[name];
  if (direct && typeof direct === 'object') {
    const first = Array.isArray(direct) ? direct[0] : direct;
    if (first && typeof first === 'object') return first as Record<string, unknown>;
  }
  for (const value of Object.values(rec)) {
    const found = findNode(value, name);
    if (found) return found;
  }
  return null;
}

function str(rec: Record<string, unknown> | null, key: string): string | undefined {
  const value = rec?.[key];
  return value === undefined || value === null || value === '' ? undefined : String(value);
}

type Protocol = {
  cStat?: string;
  xMotivo?: string;
  nProt?: string;
  dhRecbto?: string;
  digVal?: string;
};

/** cStat/xMotivo do `infProt` — a decisão sobre a nota, não sobre o lote. */
function readProtocol(parsed: unknown): Protocol {
  const infProt = findNode(parsed, 'infProt');
  return {
    cStat: str(infProt, 'cStat'),
    xMotivo: str(infProt, 'xMotivo'),
    nProt: str(infProt, 'nProt'),
    dhRecbto: str(infProt, 'dhRecbto'),
    digVal: str(infProt, 'digVal'),
  };
}

function buildProtNFe(input: {
  environment: SefazEnvironment;
  accessKey: string;
  protocol: Protocol;
}): string {
  const { protocol } = input;
  return `<protNFe versao="4.00"><infProt><tpAmb>${input.environment === 'production' ? '1' : '2'}</tpAmb>`
    + `<chNFe>${input.accessKey}</chNFe><dhRecbto>${protocol.dhRecbto || ''}</dhRecbto>`
    + `<nProt>${protocol.nProt || ''}</nProt><digVal>${protocol.digVal || ''}</digVal>`
    + `<cStat>${protocol.cStat || ''}</cStat><xMotivo>${protocol.xMotivo || ''}</xMotivo></infProt></protNFe>`;
}

export function wrapNfeProc(signedNfeXml: string, protNFe: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${signedNfeXml}${protNFe}</nfeProc>`;
}

/**
 * Leitura pura da resposta de autorização. Separada do transporte porque é
 * exatamente aqui que morava QLMED-FISCAL-004 e é aqui que o teste precisa
 * chegar sem tocar na SEFAZ.
 */
export async function interpretAutorizacaoResponse(
  xmlResponse: string,
  input: { environment: SefazEnvironment; accessKey: string; signedNfeXml: string },
): Promise<AutorizacaoResult> {
  const parsed = await parseXmlSafe(xmlResponse);
  const protocol = readProtocol(parsed);
  const batch = findNode(parsed, 'retEnviNFe');
  const batchStat = str(batch, 'cStat');

  if (!protocol.cStat) {
    // Sem protNFe não há decisão sobre a nota. Lote aceito (103/104) é
    // processamento assíncrono; qualquer outro cStat de lote é recusa do lote,
    // e aí a nota comprovadamente não foi autorizada.
    if (batchStat && !BATCH_ACCEPTED_STAT.has(batchStat)) {
      return {
        outcome: 'rejected',
        cStat: batchStat,
        xMotivo: str(batch, 'xMotivo') || 'Lote rejeitado pela SEFAZ',
      };
    }
    return {
      outcome: 'pending',
      cStat: batchStat || '',
      xMotivo: str(batch, 'xMotivo') || 'Lote em processamento na SEFAZ',
    };
  }

  if (!AUTHORIZED_STAT.has(protocol.cStat)) {
    return {
      outcome: 'rejected',
      cStat: protocol.cStat,
      xMotivo: protocol.xMotivo || 'Rejeição SEFAZ',
      nProt: protocol.nProt,
      dhRecbto: protocol.dhRecbto,
    };
  }

  const protNFe = buildProtNFe({
    environment: input.environment,
    accessKey: input.accessKey,
    protocol,
  });
  return {
    outcome: 'authorized',
    cStat: protocol.cStat,
    xMotivo: protocol.xMotivo || 'Autorizado o uso da NF-e',
    nProt: protocol.nProt,
    dhRecbto: protocol.dhRecbto,
    digVal: protocol.digVal,
    xmlAutorizado: wrapNfeProc(input.signedNfeXml, protNFe),
  };
}

/**
 * NFeConsultaProtocolo: pergunta à SEFAZ o que aconteceu com uma chave.
 * É o único jeito de sair de um estado incerto sem reenviar a nota.
 */
export async function enviarNfeAutorizacao(input: {
  signedNfeXml: string;
  cUf: string;
  environment: SefazEnvironment;
  certPem: string;
  keyPem: string;
  idLote: string;
  accessKey: string;
}): Promise<AutorizacaoResult> {
  const urls = nfeAutorizacaoUrls(input.cUf, input.environment);
  const enviNFe = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${input.idLote}</idLote><indSinc>1</indSinc>${input.signedNfeXml}</enviNFe>`;
  const xmlResponse = await sendHttps(
    urls.autorizacao,
    soapEnvelope('NFeAutorizacao4', enviNFe),
    input.certPem,
    input.keyPem,
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote',
  );
  return interpretAutorizacaoResponse(xmlResponse, input);
}

export async function consultarNfeProtocolo(input: {
  accessKey: string;
  cUf: string;
  environment: SefazEnvironment;
  certPem: string;
  keyPem: string;
}): Promise<ConsultaResult> {
  const urls = nfeAutorizacaoUrls(input.cUf, input.environment);
  const tpAmb = input.environment === 'production' ? '1' : '2';
  const consSitNFe = `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${input.accessKey}</chNFe></consSitNFe>`;
  const xmlResponse = await sendHttps(
    urls.consultaProtocolo,
    soapEnvelope('NFeConsultaProtocolo4', consSitNFe),
    input.certPem,
    input.keyPem,
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF',
  );
  const parsed = await parseXmlSafe(xmlResponse);
  const ret = findNode(parsed, 'retConsSitNFe');
  const retStat = str(ret, 'cStat') || '';
  const retMotivo = str(ret, 'xMotivo') || '';
  const protocol = readProtocol(parsed);

  if (protocol.cStat && AUTHORIZED_STAT.has(protocol.cStat)) {
    return {
      outcome: 'authorized',
      cStat: protocol.cStat,
      xMotivo: protocol.xMotivo || 'Autorizado o uso da NF-e',
      nProt: protocol.nProt,
      dhRecbto: protocol.dhRecbto,
      digVal: protocol.digVal,
      protNFe: buildProtNFe({
        environment: input.environment,
        accessKey: input.accessKey,
        protocol,
      }),
    };
  }
  // 217: "NF-e não consta na base de dados da SEFAZ". Só aqui é seguro afirmar
  // que a nota não existe e devolver número e chave ao rascunho.
  if (retStat === '217') {
    return { outcome: 'absent', cStat: retStat, xMotivo: retMotivo || 'NF-e não consta na base da SEFAZ' };
  }
  if (protocol.cStat && DENIED_STAT.has(protocol.cStat)) {
    return {
      outcome: 'rejected',
      cStat: protocol.cStat,
      xMotivo: protocol.xMotivo || 'NF-e denegada',
      nProt: protocol.nProt,
    };
  }
  if (DENIED_STAT.has(retStat)) {
    return { outcome: 'rejected', cStat: retStat, xMotivo: retMotivo || 'NF-e denegada' };
  }
  return { outcome: 'unknown', cStat: retStat, xMotivo: retMotivo || 'Situação indefinida na SEFAZ' };
}
