import https from 'https';
import zlib from 'zlib';
import { createLogger } from '@/lib/logger';

const log = createLogger('receita-nfse-client');

type HeaderMap = Record<string, string | string[] | undefined>;

function looksLikeXml(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('<') && trimmed.includes('>');
}

function isLikelyBase64(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 24 || trimmed.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed);
}

function decodeCandidatePayload(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (looksLikeXml(trimmed)) {
    return trimmed;
  }

  if (!isLikelyBase64(trimmed)) {
    return null;
  }

  try {
    const buffer = Buffer.from(trimmed, 'base64');
    if (buffer.length === 0) return null;

    // GZIP signature
    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      const gunzipped = zlib.gunzipSync(buffer).toString('utf-8');
      return looksLikeXml(gunzipped) ? gunzipped : null;
    }

    const text = buffer.toString('utf-8');
    return looksLikeXml(text) ? text : null;
  } catch (err) {
    log.warn({ err }, 'Failed to decode candidate payload');
    return null;
  }
}

function normalizeObject(value: unknown): string {
  return String(value ?? '').trim();
}

function parseJsonSafe(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch (err) {
    log.warn({ err }, 'Failed to parse JSON');
    return null;
  }
}

function collectNsuHints(value: unknown, output: Set<string>) {
  if (!value) return;

  if (typeof value === 'string') {
    const match = value.match(/\b\d{15}\b/g);
    if (match) match.forEach((nsu) => output.add(nsu));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectNsuHints(item, output);
    return;
  }

  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (key.includes('nsu')) {
        const normalized = normalizeObject(v).replace(/\D/g, '');
        if (normalized.length === 15) output.add(normalized);
      } else {
        collectNsuHints(v, output);
      }
    }
  }
}

function collectXmlDocuments(value: unknown, output: Set<string>) {
  if (!value) return;

  if (typeof value === 'string') {
    const decoded = decodeCandidatePayload(value);
    if (decoded) output.add(decoded);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectXmlDocuments(item, output);
    return;
  }

  if (typeof value === 'object') {
    for (const [, v] of Object.entries(value as Record<string, unknown>)) {
      collectXmlDocuments(v, output);
    }
  }
}

function extractDocZipXml(rawXml: string): string[] {
  const docs: string[] = [];
  const docZipRegex = /<docZip\b[^>]*>([\s\S]*?)<\/docZip>/gi;

  let match: RegExpExecArray | null;
  while ((match = docZipRegex.exec(rawXml))) {
    const payload = decodeCandidatePayload(match[1] || '');
    if (payload) docs.push(payload);
  }

  return docs;
}

function extractNsuFromText(raw: string): Set<string> {
  const nsus = new Set<string>();
  const regex = /<\s*(?:ultNSU|maxNSU|NSU)\s*>\s*(\d{15})\s*<\s*\/\s*(?:ultNSU|maxNSU|NSU)\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw))) {
    nsus.add(match[1]);
  }

  return nsus;
}

export function normalizeNsu(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '000000000000000';
  return digits.padStart(15, '0').slice(-15);
}

export function incrementNsu(value: string | null | undefined): string {
  const normalized = normalizeNsu(value);
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return normalized;
  const incremented = Math.min(numeric + 1, 999999999999999);
  return String(Math.trunc(incremented)).padStart(15, '0');
}

export interface ReceitaNfseClientOptions {
  baseUrl: string;
  apiToken?: string | null;
  certPem: string;
  keyPem: string;
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
}

export interface ReceitaNfseFetchResult {
  nsu: string;
  statusCode: number;
  contentType: string;
  rawBody: string;
  documents: string[];
  nsuHints: string[];
  isEmpty: boolean;
}

export class ReceitaNfseClient {
  private readonly baseUrl: string;
  private readonly apiToken: string | null;
  private readonly certPem: string;
  private readonly keyPem: string;
  private readonly rejectUnauthorized: boolean;
  private readonly timeoutMs: number;

  constructor(options: ReceitaNfseClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiToken = options.apiToken?.trim() ? options.apiToken.trim() : null;
    this.certPem = options.certPem;
    this.keyPem = options.keyPem;
    this.rejectUnauthorized = options.rejectUnauthorized ?? true;
    this.timeoutMs = options.timeoutMs ?? 25000;
  }

  private buildUrl(path: string, cnpjConsulta?: string | null): URL {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${safePath}`);
    const cnpj = (cnpjConsulta || '').replace(/\D/g, '');
    if (cnpj) {
      url.searchParams.set('cnpjConsulta', cnpj);
    }
    return url;
  }

  private async request(path: string, cnpjConsulta?: string | null): Promise<{ statusCode: number; headers: HeaderMap; body: string }> {
    const url = this.buildUrl(path, cnpjConsulta);
    const headers: Record<string, string> = {
      Accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.8',
    };

    if (this.apiToken) {
      headers.Authorization = `Bearer ${this.apiToken}`;
    }

    const options: https.RequestOptions = {
      method: 'GET',
      cert: this.certPem,
      key: this.keyPem,
      rejectUnauthorized: this.rejectUnauthorized,
      timeout: this.timeoutMs,
      headers,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('Timeout ao consultar API da Receita NFS-e'));
      });
      req.on('error', reject);
      req.end();
    });
  }

  async fetchDfeByNsu(nsu: string, cnpjConsulta?: string | null): Promise<ReceitaNfseFetchResult> {
    const targetNsu = normalizeNsu(nsu);
    const response = await this.request(`/DFe/${targetNsu}`, cnpjConsulta);
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    const rawBody = response.body || '';
    const documents = new Set<string>();
    const nsuHints = new Set<string>();

    const statusCode = response.statusCode;
    const isEmptyStatus = statusCode === 204 || statusCode === 404;

    if (!isEmptyStatus && rawBody.trim()) {
      const maybeJson = contentType.includes('json') ? parseJsonSafe(rawBody) : parseJsonSafe(rawBody);

      if (maybeJson) {
        collectXmlDocuments(maybeJson, documents);
        collectNsuHints(maybeJson, nsuHints);
      } else {
        for (const doc of extractDocZipXml(rawBody)) {
          documents.add(doc);
        }
      }

      if (documents.size === 0) {
        const directXml = decodeCandidatePayload(rawBody);
        if (directXml) documents.add(directXml);
      }

      Array.from(extractNsuFromText(rawBody)).forEach((hint) => {
        nsuHints.add(hint);
      });
    }

    const isEmpty = isEmptyStatus || documents.size === 0;

    return {
      nsu: targetNsu,
      statusCode,
      contentType,
      rawBody,
      documents: Array.from(documents),
      nsuHints: Array.from(nsuHints).sort(),
      isEmpty,
    };
  }

  async fetchEventsByAccessKey(accessKey: string, cnpjConsulta?: string | null): Promise<{ statusCode: number; body: string }> {
    const key = (accessKey || '').replace(/\D/g, '');
    const response = await this.request(`/NFSe/${key}/Eventos`, cnpjConsulta);
    return { statusCode: response.statusCode, body: response.body };
  }
}
