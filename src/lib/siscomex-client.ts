/**
 * Dedicated client for the SISCOMEX public NCM nomenclature download API.
 * Follows the same shape as sefaz-client.ts / nsdocs-client.ts — a named,
 * testable module instead of an inline fetch() in a route handler.
 */

const SISCOMEX_URL =
  'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json';

const REQUEST_TIMEOUT_MS = 60_000;

export interface SiscomexItem {
  Codigo?: string;
  codigo?: string;
  Descricao?: string;
  descricao?: string;
}

export class SiscomexApiError extends Error {
  constructor(public status: number) {
    super(`SISCOMEX retornou status ${status}`);
    this.name = 'SiscomexApiError';
  }
}

export class SiscomexTimeoutError extends Error {
  constructor(message = 'Timeout ao baixar tabela SISCOMEX') {
    super(message);
    this.name = 'SiscomexTimeoutError';
  }
}

/**
 * Downloads the full NCM nomenclature table from SISCOMEX.
 * Throws SiscomexApiError on non-ok HTTP status, SiscomexTimeoutError on
 * abort/timeout, or a plain Error if the response shape is unexpected.
 */
export async function fetchSiscomexNomenclature(): Promise<SiscomexItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(SISCOMEX_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      throw new SiscomexApiError(res.status);
    }

    const json = await res.json();
    const rawItems = json?.Nomenclaturas ?? json ?? [];

    if (!Array.isArray(rawItems)) {
      throw new Error('Formato inesperado da resposta do SISCOMEX');
    }

    return rawItems;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SiscomexTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
