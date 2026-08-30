/** Remove diacritics (accents) and lowercases a string for flexible search matching */
export function normalizeForSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Check if ALL search words match across any of the given fields (accent- and case-insensitive) */
export function flexMatchAll(fields: string[], normalizedSearchWords: string[]): boolean {
  const normalizedFields = fields.map(normalizeForSearch);
  return normalizedSearchWords.every((word) =>
    normalizedFields.some((field) => field.includes(word))
  );
}

export function formatCnpj(cnpj: string): string {
  if (!cnpj || cnpj.length !== 14) return cnpj;
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatAmount(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCurrencyShort(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return formatCurrency(value);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/** Data de documento gravada em UTC meia-noite — não deslocar para o fuso local. */
export function formatDocumentDate(issuedAt: string | Date | null | undefined): string {
  if (issuedAt == null || issuedAt === '') return '—';
  const date = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAccessKey(key: string): string {
  return key.replace(/(.{4})/g, '$1 ').trim();
}

export function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - day.getTime()) / 86400000);

  if (diffDays === 0) return 'Hoje';

  const dow = today.getDay() || 7;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dow + 1);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  if (day >= startOfWeek && day < endOfWeek && diffDays !== 0) return 'Esta semana';

  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  if (day >= startOfLastWeek && day < startOfWeek) return 'Semana passada';

  const startOfNextWeek = new Date(endOfWeek);
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
  if (day >= startOfNextWeek && day < endOfNextWeek) return 'Próxima semana';

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  if (day >= startOfMonth && day < startOfNextMonth) return 'Este mês';

  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  if (day >= startOfLastMonth && day < startOfMonth) return 'Mês passado';

  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

// ── Shared XML / data-processing helpers ──

/** Trim a value to a non-empty string or return null */
export function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

/** Wrap a value in an array; nullish values become an empty array */
export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Parse a numeric value (with comma support), returning 0 for non-finite results */
export function toNumber(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const normalized = String(value).replace(',', '.');
  const number = parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

/** Filtro de listagem fiscal/cadastro (py-2.5). Não unificar com DETAIL_INPUT_CLS. */
export const FILTER_INPUT_CLS =
  'block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm transition-all';
