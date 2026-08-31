import type { Prisma } from '@prisma/client';

export type IssuedCustomerRow = {
  name: string;
  cnpj: string;
  tradeName?: string | null;
  companyId?: string;
};

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
  return name.includes(q) || trade.includes(q);
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
