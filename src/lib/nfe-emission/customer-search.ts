import type { Prisma } from '@prisma/client';
import { sumMoney } from '@/lib/money';
import { recipientDisplayName } from '@/lib/nfe-emission/recipient-display-name';

export type IssuedCustomerRow = {
  name: string;
  cnpj: string;
  tradeName?: string | null;
  shortName?: string | null;
  companyId?: string;
};

/** Top N clientes por Σ totalValue das NF-e emitidas na janela. */
export const DESTINATARIO_TOP_BILLED_LIMIT = 10;
/** Janela de faturamento para o ranking do dropdown (meses civis). */
export const DESTINATARIO_BILLING_WINDOW_MONTHS = 6;

export type DestinatarioAddressSource = {
  street?: string | null;
  district?: string | null;
  city?: string | null;
  uf?: string | null;
};

export function normalizeSearchDigits(search: string): string {
  return search.replace(/\D/g, '');
}

/** CNPJ (com ou sem máscara). Qualquer letra no termo é busca por nome. */
export function isCnpjLikeSearch(search: string): boolean {
  const trimmed = search.trim();
  if (!trimmed) return false;
  const digits = normalizeSearchDigits(trimmed);
  if (!digits) return false;
  return trimmed.replace(/[\s./-]/g, '') === digits;
}

export function customerMatchesSearch(row: IssuedCustomerRow, search: string): boolean {
  const term = search.trim();
  if (!term) return true;
  const cnpjDigits = normalizeSearchDigits(row.cnpj);
  if (isCnpjLikeSearch(term)) {
    return cnpjDigits.startsWith(normalizeSearchDigits(term));
  }
  const q = term.toLocaleLowerCase('pt-BR');
  const name = row.name.toLocaleLowerCase('pt-BR');
  const trade = (row.tradeName || '').toLocaleLowerCase('pt-BR');
  const nick = (row.shortName || '').toLocaleLowerCase('pt-BR');
  return name.includes(q) || trade.includes(q) || nick.includes(q);
}

export function filterIssuedCustomersForCompany(
  rows: IssuedCustomerRow[],
  companyId: string,
  search: string,
): IssuedCustomerRow[] {
  return rows.filter((row) => row.companyId === companyId && customerMatchesSearch(row, search));
}

export function buildIssuedCustomerWhere(
  companyId: string,
  search: string,
  extraCnpjs: string[] = [],
): Prisma.InvoiceWhereInput {
  if (!companyId) throw new Error('companyId obrigatório na busca de destinatário');
  const term = search.trim();
  const or: Prisma.InvoiceWhereInput[] = [];

  if (term) {
    if (isCnpjLikeSearch(term)) {
      or.push({ recipientCnpj: { startsWith: normalizeSearchDigits(term) } });
    } else {
      or.push({ recipientName: { contains: term, mode: 'insensitive' } });
      if (extraCnpjs.length > 0) {
        or.push({ recipientCnpj: { in: extraCnpjs } });
      }
    }
  }

  return {
    companyId,
    type: 'NFE',
    direction: 'issued',
    recipientCnpj: { not: null },
    ...(or.length ? { OR: or } : {}),
  };
}

function cleanCity(city: string, uf: string): string {
  const trimmedUf = uf.trim().toUpperCase();
  let cleaned = city.trim();
  if (trimmedUf) {
    cleaned = cleaned.replace(new RegExp(`\\s*-\\s*${trimmedUf}$`, 'i'), '').trim();
  }
  return cleaned;
}

export function mergeDestinatarioAddressSources(
  override?: {
    street?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
  } | null,
  fiscal?: { city?: string | null; uf?: string | null } | null,
): DestinatarioAddressSource {
  return {
    street: override?.street || null,
    district: override?.district || null,
    city: override?.city || fiscal?.city || null,
    uf: override?.state || fiscal?.uf || null,
  };
}

/** Uma linha. Sem CEP, complemento ou IE — mesmo que venham no objeto. */
export function formatDestinatarioAddressLine(
  parts: DestinatarioAddressSource & {
    zip?: string | null;
    complement?: string | null;
    ie?: string | null;
  },
): string {
  const uf = (parts.uf || '').trim().toUpperCase();
  const city = cleanCity(parts.city || '', uf);
  const district = (parts.district || '').trim();
  const street = (parts.street || '').trim();
  const cityUf = city && uf ? `${city}/${uf}` : city || uf;
  if (!cityUf) return '';
  if (district) return `${district} — ${cityUf}`;
  if (street) {
    const short = street.length > 40 ? `${street.slice(0, 37)}…` : street;
    return `${short} — ${cityUf}`;
  }
  return cityUf;
}

export type BillingInvoiceRow = {
  recipientCnpj: string | null;
  recipientName: string | null;
  totalValue: number | string;
  companyId?: string;
};

export type RankedRecipient = {
  cnpj: string;
  name: string;
  billedTotal: number;
};

/** Início da janela de faturamento (agora − N meses). */
export function destinatarioBillingWindowStart(
  now: Date = new Date(),
  months: number = DESTINATARIO_BILLING_WINDOW_MONTHS,
): Date {
  const start = new Date(now.getTime());
  start.setMonth(start.getMonth() - months);
  return start;
}

/**
 * WHERE do ranking: NF-e emitidas da empresa, não canceladas, na janela.
 * companyId sempre do servidor — nunca do request.
 */
export function buildTopBilledWhere(
  companyId: string,
  since: Date,
): Prisma.InvoiceWhereInput {
  if (!companyId) throw new Error('companyId obrigatório no ranking de destinatário');
  return {
    companyId,
    type: 'NFE',
    direction: 'issued',
    recipientCnpj: { not: null },
    cancelledAt: null,
    issueDate: { gte: since },
  };
}

function moneyAmount(value: number | string): number {
  if (value === '' || value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Agrega Σ totalValue por CNPJ (14 dígitos). Ordena maior faturamento
 * primeiro; empate por nome. Limita a `limit` (padrão 10).
 */
export function rankRecipientsByBilling(
  rows: BillingInvoiceRow[],
  limit: number = DESTINATARIO_TOP_BILLED_LIMIT,
  companyId?: string,
): RankedRecipient[] {
  const map = new Map<string, { name: string; amounts: number[] }>();
  for (const row of rows) {
    if (companyId && row.companyId && row.companyId !== companyId) continue;
    const cnpj = normalizeSearchDigits(row.recipientCnpj || '');
    if (cnpj.length !== 14) continue;
    const amount = moneyAmount(row.totalValue);
    const existing = map.get(cnpj);
    if (!existing) {
      map.set(cnpj, {
        name: (row.recipientName || '').trim() || cnpj,
        amounts: [amount],
      });
    } else {
      existing.amounts.push(amount);
      const name = (row.recipientName || '').trim();
      if (name) existing.name = name;
    }
  }
  return [...map.entries()]
    .map(([cnpj, v]) => ({
      cnpj,
      name: v.name,
      billedTotal: sumMoney(v.amounts),
    }))
    .sort(
      (a, b) =>
        b.billedTotal - a.billedTotal
        || a.name.localeCompare(b.name, 'pt-BR'),
    )
    .slice(0, limit);
}

export type DestinatarioListItem = {
  cnpj: string;
  name: string;
  shortName?: string;
  addressLine?: string;
  topBilled?: boolean;
};

/**
 * Sem busca: somente os top faturados (ordem do ranking) — não dumpa A–Z.
 * Com busca: matches filtrados em ordem alfabética (topBilled false).
 * O restante do cadastro só entra via busca manual.
 */
export function orderDestinatariosForDropdown<
  T extends { cnpj: string; name: string; shortName?: string | null },
>(
  customers: T[],
  topBilledOrdered: Array<{ cnpj: string; name?: string }>,
  searchActive: boolean,
): Array<T & { topBilled: boolean }> {
  if (searchActive) {
    return [...customers]
      .sort((a, b) =>
        recipientDisplayName(a.name, a.shortName).localeCompare(
          recipientDisplayName(b.name, b.shortName),
          'pt-BR',
        ),
      )
      .map((row) => ({ ...row, topBilled: false }));
  }

  const byCnpj = new Map(customers.map((row) => [row.cnpj, row]));
  const top: Array<T & { topBilled: boolean }> = [];
  const seen = new Set<string>();

  for (const ranked of topBilledOrdered) {
    if (seen.has(ranked.cnpj)) continue;
    const fromList = byCnpj.get(ranked.cnpj);
    const row = fromList ?? ({
      cnpj: ranked.cnpj,
      name: ranked.name || ranked.cnpj,
    } as T);
    top.push({ ...row, topBilled: true });
    seen.add(ranked.cnpj);
  }

  return top;
}
