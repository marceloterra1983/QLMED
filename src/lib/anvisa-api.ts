const ANVISA_SAUDE_URL = 'https://consultas.anvisa.gov.br/api/saude/equipamento/';
const ANVISA_MEDS_URL = 'https://consultas.anvisa.gov.br/api/consulta/medicamentos/registro/';

export interface AnvisaRegistryData {
  nomeProduto: string | null;
  nomeEmpresa: string | null;
  processoRegistro: string | null;
  situacaoRegistro: string | null;
  vencimentoRegistro: string | null;
  classeRisco: string | null;
  dataset: 'saude' | 'medicamentos';
}

interface AnvisaApiItem {
  numeroRegistro?: string;
  nomeProduto?: string;
  descricaoProduto?: string;
  nomeEmpresa?: string;
  empresa?: string;
  processoRegistro?: string;
  processo?: string;
  situacaoRegistro?: string;
  situacao?: string;
  vencimentoRegistro?: string;
  vencimento?: string;
  classeRisco?: string;
  classe?: string;
  produto?: string;
}

/**
 * Resultado da consulta à ANVISA.
 *
 * `found: false` + `error: null`  → registro não existe na ANVISA (404 / lista
 *   vazia / resposta sem item). É seguro gravar "Não encontrado" e marcar
 *   anvisaSyncedAt para não reprocessar.
 *
 * `found: false` + `error: string` → falha de rede/timeout/HTTP 5xx/JSON
 *   inválido. O caller NUNCA deve tratar isso como "não encontrado": marcar
 *   anvisaSyncedAt nesse caso corrompe o catálogo (registos válidos ficam
 *   permanentemente classificados como inexistentes e nunca são reprocessados).
 */
export type AnvisaQueryResult =
  | { found: true; data: AnvisaRegistryData; error: null }
  | { found: false; data: null; error: string | null };

async function queryAnvisaDataset(
  url: string,
  registration: string,
  dataset: AnvisaRegistryData['dataset'],
): Promise<AnvisaQueryResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    return { found: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }

  if (!res.ok) {
    if (res.status === 404) return { found: false, data: null, error: null };
    return { found: false, data: null, error: `HTTP ${res.status}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    return { found: false, data: null, error: err instanceof Error ? err.message : 'JSON inválido' };
  }

  const rawItems =
    json && typeof json === 'object'
      ? (json as { content?: unknown; data?: unknown }).content
        ?? (json as { data?: unknown }).data
        ?? (Array.isArray(json) ? json : null)
      : null;
  if (rawItems != null && !Array.isArray(rawItems)) {
    return { found: false, data: null, error: 'JSON inválido' };
  }
  const items: AnvisaApiItem[] = Array.isArray(rawItems) ? rawItems : [];
  const item = items.find(
    (i) => String(i.numeroRegistro ?? '').replace(/\D/g, '') === registration,
  ) ?? items[0];

  if (!item) return { found: false, data: null, error: null };

  return {
    found: true,
    data: {
      nomeProduto: item.nomeProduto ?? item.descricaoProduto ?? item.produto ?? null,
      nomeEmpresa: item.nomeEmpresa ?? item.empresa ?? null,
      processoRegistro: item.processoRegistro ?? item.processo ?? null,
      situacaoRegistro: item.situacaoRegistro ?? item.situacao ?? null,
      vencimentoRegistro: item.vencimentoRegistro ?? item.vencimento ?? null,
      classeRisco: dataset === 'medicamentos' ? null : (item.classeRisco ?? item.classe ?? null),
      dataset,
    },
    error: null,
  };
}

export async function fetchAnvisaData(registration: string): Promise<AnvisaQueryResult> {
  const encoded = encodeURIComponent(registration);

  const saude = await queryAnvisaDataset(
    `${ANVISA_SAUDE_URL}?count=5&filter%5BnumeroRegistro%5D=${encoded}`,
    registration,
    'saude',
  );
  if (saude.found) return saude;
  if (saude.error) return saude;

  return queryAnvisaDataset(
    `${ANVISA_MEDS_URL}?count=5&filter%5BnumeroRegistro%5D=${encoded}`,
    registration,
    'medicamentos',
  );
}
