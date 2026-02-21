import https from 'https';
import zlib from 'zlib';
import { parseXmlSafe, parseXmlSafeNoMerge } from '@/lib/safe-xml-parser';
import { promisify } from 'util';
import { CertificateManager } from './certificate-manager';

const gunzip = promisify(zlib.gunzip);

const URL_PRODUCAO = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const URL_HOMOLOGACAO = 'https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';

export interface SefazDocument {
  nsuseq: string;
  chave: string;
  emitente: string;
  descEvento?: string;
  tipo: 'nfe' | 'evento';
  xml: string;
  schema: string;
}

export interface DistDFeResponse {
  status: 'success' | 'error' | 'empty';
  ultNSU: string;
  maxNSU: string;
  cStat: string;
  xMotivo: string;
  docs: SefazDocument[];
}

export class SefazClient {
  private certPem: string;
  private keyPem: string;
  private isProduction: boolean;
  private uf: string;
  private cnpj: string;

  constructor(certPem: string, keyPem: string, cnpj: string, isProduction = true, uf = '50') {
    this.certPem = certPem;
    this.keyPem = keyPem;
    this.cnpj = CertificateManager.cleanCnpj(cnpj);
    this.isProduction = isProduction;
    this.uf = uf;
  }

  private buildEnvelope(bodyContent: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <cUF>${this.uf}</cUF>
      <versaoDados>1.01</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        ${bodyContent}
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private buildDistDFeInt(ultNSU: string): string {
    const tpAmb = this.isProduction ? '1' : '2';
    const nsuPad = ultNSU.padStart(15, '0');

    return `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
      <tpAmb>${tpAmb}</tpAmb>
      <cUFAutor>${this.uf}</cUFAutor>
      <CNPJ>${this.cnpj}</CNPJ>
      <distNSU>
        <ultNSU>${nsuPad}</ultNSU>
      </distNSU>
    </distDFeInt>`;
  }

  private async sendSoapRequest(envelope: string): Promise<string> {
    const url = new URL(this.isProduction ? URL_PRODUCAO : URL_HOMOLOGACAO);
    const options = {
      cert: this.certPem,
      key: this.keyPem,
      // SSL verification enabled by default for security.
      // Set SEFAZ_VERIFY_SSL=false only if SEFAZ has certificate chain issues.
      rejectUnauthorized: process.env.SEFAZ_VERIFY_SSL !== 'false',
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(envelope),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            console.error('SOAP Error Status:', res.statusCode);
            reject(new Error(`SEFAZ HTTP Error ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      });

      req.on('error', (e) => reject(e));
      req.write(envelope);
      req.end();
    });
  }

  /**
   * Extrai dados de um XML de NFe descompactado usando xml2js
   */
  private async extractNfeData(xml: string): Promise<{
    chave: string;
    emitente: string;
    tipo: 'nfe' | 'evento';
  }> {
    try {
      const result = await parseXmlSafeNoMerge(xml);

      // resNFe (resumo)
      if (result.resNFe) {
        return {
          chave: result.resNFe.chNFe || '',
          emitente: result.resNFe.xNome || '',
          tipo: 'nfe',
        };
      }

      // nfeProc (NFe completa)
      if (result.nfeProc) {
        const nfe = result.nfeProc.NFe;
        const infNfe = nfe?.infNFe;
        const emit = infNfe?.emit;
        const chave = infNfe?.$?.Id?.replace('NFe', '') || '';
        const emitente = emit?.xNome || '';
        return { chave, emitente, tipo: 'nfe' };
      }

      // resEvento
      if (result.resEvento) {
        return {
          chave: result.resEvento.chNFe || '',
          emitente: 'SEFAZ Evento',
          tipo: 'evento',
        };
      }

      // procEventoNFe
      if (result.procEventoNFe) {
        const evento = result.procEventoNFe.evento;
        const infEvento = evento?.infEvento;
        return {
          chave: infEvento?.chNFe || '',
          emitente: 'SEFAZ Evento',
          tipo: 'evento',
        };
      }
    } catch {
      // Fallback para regex se xml2js falhar
    }

    // Fallback: tentar com regex simples
    const chaveMatch = xml.match(/<chNFe>(\d+)<\/chNFe>/) || xml.match(/Id="NFe(\d+)"/);
    const nomeMatch = xml.match(/<xNome>([^<]+)<\/xNome>/);
    const isEvento = xml.includes('resEvento') || xml.includes('procEventoNFe');

    return {
      chave: chaveMatch?.[1] || '',
      emitente: isEvento ? 'SEFAZ Evento' : (nomeMatch?.[1] || ''),
      tipo: isEvento ? 'evento' : 'nfe',
    };
  }

  private async parseResponse(xmlResponse: string): Promise<DistDFeResponse> {
    const result = await parseXmlSafe(xmlResponse);

    const body = result?.Envelope?.Body;
    const retDist = body?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt;

    if (!retDist) {
      throw new Error('Resposta inválida da SEFAZ (estrutura SOAP inesperada)');
    }

    const cStat = retDist.cStat;
    const xMotivo = retDist.xMotivo;
    const ultNSU = retDist.ultNSU;
    const maxNSU = retDist.maxNSU;

    if (cStat === '137') {
      return { status: 'empty', cStat, xMotivo, ultNSU, maxNSU, docs: [] };
    }

    if (cStat !== '138') {
      return { status: 'error', cStat, xMotivo, ultNSU, maxNSU, docs: [] };
    }

    // Processar documentos
    const lote = retDist.loteDistDFeInt?.docZip;
    const docList = Array.isArray(lote) ? lote : (lote ? [lote] : []);
    const docs: SefazDocument[] = [];

    for (const d of docList) {
      // Com mergeAttrs: NSU e schema ficam como propriedades diretas
      // O conteúdo base64 fica em '_' (texto do elemento)
      const nsu = d.NSU || '';
      const schema = d.schema || '';
      const base64Content = d._ || (typeof d === 'string' ? d : '');

      if (!base64Content || typeof base64Content !== 'string') continue;

      try {
        const buffer = Buffer.from(base64Content, 'base64');
        const xmlDecompressed = (await gunzip(buffer)).toString('utf-8');
        const extracted = await this.extractNfeData(xmlDecompressed);

        docs.push({
          nsuseq: nsu,
          chave: extracted.chave,
          emitente: extracted.emitente,
          tipo: extracted.tipo,
          schema,
          xml: xmlDecompressed,
        });
      } catch (err) {
        console.error(`Erro ao processar doc NSU ${nsu}:`, err);
      }
    }

    return { status: 'success', cStat, xMotivo, ultNSU, maxNSU, docs };
  }

  async buscarNovosDocumentos(ultimoNSU: string): Promise<DistDFeResponse> {
    const envelope = this.buildEnvelope(this.buildDistDFeInt(ultimoNSU));
    const xmlResponse = await this.sendSoapRequest(envelope);
    return this.parseResponse(xmlResponse);
  }
}
