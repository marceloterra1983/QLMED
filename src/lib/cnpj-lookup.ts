import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';
import type { CnpjResult } from '@/lib/cnpj-result';

export type { CnpjResult } from '@/lib/cnpj-result';
export { parseCnpjResponse } from '@/lib/cnpj-result';

const log = createLogger('cnpj-lookup');

const globalForCnpj = globalThis as unknown as {
  cnpjMemoryCache?: Map<string, { result: CnpjResult | null; at: number }>;
};

const MEMORY_TTL_MS = 10 * 60 * 1000; // 10 min
const DB_TTL_DAYS = 30;

function getMemoryCache(): Map<string, { result: CnpjResult | null; at: number }> {
  if (!globalForCnpj.cnpjMemoryCache) globalForCnpj.cnpjMemoryCache = new Map();
  return globalForCnpj.cnpjMemoryCache;
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
  const row = await prisma.cnpjCache.findUnique({ where: { cnpj } });
  const staleBefore = Date.now() - DB_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (!row || row.fetchedAt.getTime() <= staleBefore) return null;
  return row.data as unknown as CnpjResult;
}

async function saveToDb(cnpj: string, data: CnpjResult): Promise<void> {
  try {
    const fetchedAt = new Date();
    const json = data as unknown as Prisma.InputJsonValue;
    await prisma.cnpjCache.upsert({
      where: { cnpj },
      create: { cnpj, data: json, fetchedAt },
      update: { data: json, fetchedAt },
    });
  } catch (err) {
    log.error({ err }, 'Error saving to DB');
  }
}

// ── Public API ──

export async function lookupCnpj(cnpj: string, forceRefresh = false): Promise<CnpjResult | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

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
