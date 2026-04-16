import { createLogger } from '@/lib/logger';

const NSDOCS_API_BASE = 'https://api.nsdocs.com.br/v2';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

const log = createLogger('nsdocs-client');

interface NsdocsRequestOptions {
  method?: string;
  body?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface ConsultaResponse {
  id_consulta: string;
  status_consulta: string;
}

interface RetornoConsulta {
  status: string;
  documentos?: NsdocsDocumento[];
  erro?: string;
}

interface NsdocsDocumento {
  id: string;
  chave_acesso: string;
  numero: string;
  serie: string;
  data_emissao: string;
  cnpj_emitente: string;
  nome_emitente: string;
  cnpj_destinatario: string;
  nome_destinatario: string;
  valor_total: number;
  situacao: string;
  tipo: string; // NFE, CTE, NFSE
}

interface NsdocsEmpresa {
  id: string;
  cnpj: string;
  razao_social: string;
}

/**
 * Raised when NSDocs API enforces rate limiting or consecutive 5xx errors
 * exhaust the retry budget. Callers should abort the sync and avoid
 * advancing cursors so the window is retried on the next run.
 */
export class NsdocsTransientError extends Error {
  readonly httpStatus?: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, httpStatus?: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'NsdocsTransientError';
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class NsdocsPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NsdocsPaginationError';
  }
}

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber;
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    const diff = Math.ceil((parsed - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }
  return undefined;
}

function redactForLog(raw: string, maxLen = 200): string {
  if (!raw) return '';
  // Strip obvious secret leakage from echoes (authorization headers, bearer tokens).
  const cleaned = raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"***"');
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '…' : cleaned;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NsdocsClient {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    label: string,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);

        // Retry 429 / 5xx with exponential backoff, honoring Retry-After when provided.
        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          const retryAfterSec = parseRetryAfter(response.headers.get('retry-after'));
          if (attempt < MAX_RETRIES) {
            const backoff = retryAfterSec !== undefined
              ? Math.max(retryAfterSec * 1000, BASE_BACKOFF_MS)
              : BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
            log.warn({ label, attempt, status: response.status, backoffMs: backoff }, 'NSDocs retry');
            // Drain response body so the connection can be reused.
            await response.text().catch(() => '');
            await sleep(backoff);
            continue;
          }
          const text = await response.text().catch(() => '');
          throw new NsdocsTransientError(
            `NSDocs ${label} exhausted ${MAX_RETRIES} retries (HTTP ${response.status}): ${redactForLog(text)}`,
            response.status,
            retryAfterSec,
          );
        }

        return response;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        // Abort (timeout) and transient network errors: retry with backoff.
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        const isNetwork = err instanceof TypeError; // fetch throws TypeError on network failures
        if ((isAbort || isNetwork) && attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          log.warn({ label, attempt, reason: isAbort ? 'timeout' : 'network', backoffMs: backoff }, 'NSDocs retry');
          await sleep(backoff);
          continue;
        }
        if (err instanceof NsdocsTransientError) throw err;
        throw err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async request<T>(path: string, options: NsdocsRequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS } = options;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        ...headers,
      },
    };

    if (body && method !== 'GET') {
      fetchOptions.body = new URLSearchParams(body).toString();
    }

    const url = `${NSDOCS_API_BASE}${path}`;
    const response = await this.fetchWithRetry(url, fetchOptions, timeoutMs, `${method} ${path}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`NSDocs API error (${response.status}): ${redactForLog(errorText)}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Testa a conexão com a API NSDocs listando as empresas
   */
  async testarConexao(): Promise<{ ok: boolean; empresas?: NsdocsEmpresa[]; error?: string }> {
    try {
      const empresas = await this.request<NsdocsEmpresa[]>('/empresas');
      return { ok: true, empresas };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /**
   * Inicia consulta de documentos por CNPJ na SEFAZ (assíncrono)
   * Retorna um id_consulta para polling posterior
   */
  async consultarCnpj(cnpj: string): Promise<ConsultaResponse> {
    return this.request<ConsultaResponse>('/consultas/cnpj', {
      method: 'POST',
      body: { documento: cnpj.replace(/\D/g, '') },
    });
  }

  /**
   * Inicia consulta de documento por Chave de Acesso (44 dígitos)
   */
  async consultarChaveAcesso(chaveAcesso: string): Promise<ConsultaResponse> {
    return this.request<ConsultaResponse>('/consultas/dfe', {
      method: 'POST',
      body: { documento: chaveAcesso.replace(/\D/g, '') },
    });
  }

  /**
   * Verifica o resultado de uma consulta assíncrona
   * @param tipo - 'cnpj' ou 'dfe'
   * @param idConsulta - ID retornado pela consulta
   */
  async retornoConsulta(tipo: 'cnpj' | 'dfe', idConsulta: string): Promise<RetornoConsulta> {
    return this.request<RetornoConsulta>(`/consultas/${tipo}/${idConsulta}`);
  }

  /**
   * Lista documentos armazenados no NSDocs (página única)
   */
  async listarDocumentos(filtros?: Record<string, string>): Promise<NsdocsDocumento[]> {
    const params = filtros ? '?' + new URLSearchParams(filtros).toString() : '';
    const docs = await this.request<NsdocsDocumento[]>(`/documentos${params}`);
    if (!Array.isArray(docs)) {
      throw new NsdocsPaginationError(`NSDocs /documentos returned non-array payload: ${redactForLog(JSON.stringify(docs))}`);
    }
    return docs;
  }

  /**
   * Lista TODOS os documentos com paginação automática.
   * A API NSDocs usa 'quantidade' (limit) e 'deslocamento' (offset).
   *
   * Throws `NsdocsPaginationError` when the API returns a non-array payload
   * or when the safety cap is hit with more pages remaining — callers treat
   * this as a hard failure so the sync window is NOT advanced and can be
   * retried on the next run.
   */
  async listarTodosDocumentos(filtros?: Record<string, string>): Promise<NsdocsDocumento[]> {
    const allDocs: NsdocsDocumento[] = [];
    const pageSize = 100;
    let deslocamento = 0;
    let safetyCounter = 0;
    const maxPages = 50;

    while (safetyCounter < maxPages) {
      safetyCounter++;
      const paginatedFilters: Record<string, string> = {
        ...(filtros || {}),
        quantidade: String(pageSize),
        deslocamento: String(deslocamento),
      };

      const params = '?' + new URLSearchParams(paginatedFilters).toString();
      const docs = await this.request<NsdocsDocumento[]>(`/documentos${params}`);

      if (!Array.isArray(docs)) {
        throw new NsdocsPaginationError(
          `NSDocs /documentos returned non-array payload at offset=${deslocamento}: ${redactForLog(JSON.stringify(docs))}`,
        );
      }

      if (docs.length === 0) {
        // Empty page — end of result set.
        return allDocs;
      }

      allDocs.push(...docs);
      deslocamento += docs.length;

      if (docs.length < pageSize) {
        return allDocs;
      }
    }

    // Hit max pages while still getting full pages: caller must know data was truncated.
    throw new NsdocsPaginationError(
      `NSDocs pagination exceeded ${maxPages} pages (${allDocs.length} docs fetched) without exhausting results. Narrow the date window or increase maxPages.`,
    );
  }

  /**
   * Recupera o XML de um documento
   */
  async recuperarXml(documentoId: string): Promise<string> {
    const url = `${NSDOCS_API_BASE}/documentos/${documentoId}/xml`;
    const response = await this.fetchWithRetry(
      url,
      {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/xml',
        },
      },
      REQUEST_TIMEOUT_MS,
      `GET /documentos/${documentoId}/xml`,
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`NSDocs API error (${response.status}): ${redactForLog(text)}`);
    }

    return response.text();
  }

  /**
   * Recupera o PDF (DANFE) de um documento
   */
  async recuperarPdf(documentoId: string): Promise<ArrayBuffer> {
    const url = `${NSDOCS_API_BASE}/documentos/${documentoId}/pdf`;
    const response = await this.fetchWithRetry(
      url,
      {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/pdf',
        },
      },
      REQUEST_TIMEOUT_MS,
      `GET /documentos/${documentoId}/pdf`,
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`NSDocs API error (${response.status}): ${redactForLog(text)}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Lista empresas cadastradas no NSDocs
   */
  async listarEmpresas(): Promise<NsdocsEmpresa[]> {
    return this.request<NsdocsEmpresa[]>('/empresas');
  }

  /**
   * Fluxo completo: consulta CNPJ e aguarda resultado (com polling)
   * Retorna os documentos encontrados
   */
  async syncCompleto(cnpj: string, maxTentativas = 30, intervaloMs = 2000): Promise<RetornoConsulta> {
    const consulta = await this.consultarCnpj(cnpj);

    if (consulta.status_consulta !== 'Ok') {
      throw new Error(`Erro ao iniciar consulta: ${consulta.status_consulta}`);
    }

    for (let i = 0; i < maxTentativas; i++) {
      await sleep(intervaloMs);

      const retorno = await this.retornoConsulta('cnpj', consulta.id_consulta);

      if (retorno.status === 'Concluído' || retorno.status === 'Concluido') {
        return retorno;
      }

      if (retorno.status === 'Erro') {
        throw new Error(`Erro na consulta SEFAZ: ${retorno.erro || 'Erro desconhecido'}`);
      }
    }

    throw new Error('Timeout: consulta SEFAZ não foi concluída a tempo');
  }
}

export type { NsdocsDocumento, ConsultaResponse, RetornoConsulta, NsdocsEmpresa };
