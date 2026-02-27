import prisma from '@/lib/prisma';

export interface CnpjResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  descSituacao: string | null;
  cnaePrincipal: { codigo: string; descricao: string } | null;
  porte: string | null;
  naturezaJuridica: string | null;
  endereco: {
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
  };
  telefone: string | null;
  email: string | null;
  capitalSocial: number | null;
  simplesNacional: boolean | null;
  mei: boolean | null;
}

// ── Table setup ──

type InitState = { promise?: Promise<void> };
const globalForCnpj = globalThis as unknown as {
  cnpjCacheInitState?: InitState;
  cnpjMemoryCache?: Map<string, { result: CnpjResult | null; at: number }>;
};

if (!globalForCnpj.cnpjCacheInitState) {
  globalForCnpj.cnpjCacheInitState = {};
}
const initState = globalForCnpj.cnpjCacheInitState;

const MEMORY_TTL_MS = 10 * 60 * 1000; // 10 min
const DB_TTL_DAYS = 30;

function getMemoryCache(): Map<string, { result: CnpjResult | null; at: number }> {
  if (!globalForCnpj.cnpjMemoryCache) globalForCnpj.cnpjMemoryCache = new Map();
  return globalForCnpj.cnpjMemoryCache;
}

export async function ensureCnpjCacheTable(): Promise<void> {
  if (!initState.promise) {
    initState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS cnpj_cache (
          cnpj TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((err) => {
      initState.promise = undefined;
      throw err;
    });
  }
  return initState.promise;
}

// ── BrasilAPI fetch ──

async function fetchFromApi(cnpj: string): Promise<CnpjResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const d = await res.json();

    return {
      cnpj: (d.cnpj || cnpj).replace(/\D/g, ''),
      razaoSocial: d.razao_social || d.nome_fantasia || '',
      nomeFantasia: d.nome_fantasia || null,
      situacaoCadastral: d.descricao_situacao_cadastral || null,
      descSituacao: d.descricao_situacao_cadastral || null,
      cnaePrincipal: d.cnae_fiscal_descricao
        ? { codigo: String(d.cnae_fiscal || ''), descricao: d.cnae_fiscal_descricao }
        : null,
      porte: d.porte || d.descricao_porte || null,
      naturezaJuridica: d.natureza_juridica || null,
      endereco: {
        logradouro: d.logradouro || null,
        numero: d.numero || null,
        bairro: d.bairro || null,
        municipio: d.municipio || null,
        uf: d.uf || null,
        cep: d.cep || null,
      },
      telefone: d.ddd_telefone_1 || null,
      email: d.email || null,
      capitalSocial: typeof d.capital_social === 'number' ? d.capital_social : null,
      simplesNacional: d.opcao_pelo_simples ?? null,
      mei: d.opcao_pelo_mei ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── DB cache ──

async function getFromDb(cnpj: string): Promise<CnpjResult | null> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT data FROM cnpj_cache WHERE cnpj = $1 AND fetched_at > NOW() - INTERVAL '${DB_TTL_DAYS} days'`,
    cnpj,
  );
  if (rows.length === 0) return null;
  try {
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    return data as CnpjResult;
  } catch {
    return null;
  }
}

async function saveToDb(cnpj: string, data: CnpjResult): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cnpj_cache (cnpj, data, fetched_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (cnpj) DO UPDATE SET data = EXCLUDED.data, fetched_at = NOW()`,
      cnpj,
      JSON.stringify(data),
    );
  } catch (err) {
    console.error('[cnpj-cache] Error saving to DB:', err);
  }
}

// ── Public API ──

export async function lookupCnpj(cnpj: string, forceRefresh = false): Promise<CnpjResult | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  await ensureCnpjCacheTable();

  const mem = getMemoryCache();

  if (!forceRefresh) {
    // Check in-memory cache
    const cached = mem.get(digits);
    if (cached && Date.now() - cached.at < MEMORY_TTL_MS) {
      return cached.result;
    }
    if (cached) mem.delete(digits);

    // Check DB cache
    const dbResult = await getFromDb(digits);
    if (dbResult) {
      mem.set(digits, { result: dbResult, at: Date.now() });
      return dbResult;
    }
  } else {
    mem.delete(digits);
  }

  // Fetch from API
  const apiResult = await fetchFromApi(digits);
  if (apiResult) {
    await saveToDb(digits, apiResult);
    mem.set(digits, { result: apiResult, at: Date.now() });
    return apiResult;
  }

  // Cache null for only 30s to allow quick retries after transient failures
  mem.set(digits, { result: null, at: Date.now() - MEMORY_TTL_MS + 30_000 });
  return null;
}
