/** Remove diacritics (accents) and lowercases a string for flexible search matching */
export function normalizeForSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Check if haystack contains needle in an accent- and case-insensitive way */
export function flexMatch(haystack: string, needle: string): boolean {
  return normalizeForSearch(haystack).includes(needle);
}

export function formatCnpj(cnpj: string): string {
  if (!cnpj || cnpj.length !== 14) return cnpj;
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatCurrencyShort(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return formatCurrency(value);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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

export function formatValue(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export type StatusColor = 'emerald' | 'red' | 'amber';

export interface StatusDisplay {
  label: string;
  color: StatusColor;
  icon: string;
}

export function getStatusDisplay(status: string): StatusDisplay {
  switch (status) {
    case 'confirmed':
      return { label: 'Autorizada', color: 'emerald', icon: 'check_circle' };
    case 'rejected':
      return { label: 'Cancelada', color: 'red', icon: 'cancel' };
    default:
      return { label: 'Pendente', color: 'amber', icon: 'schedule' };
  }
}

export const statusDotClasses: Record<StatusColor, { ping: string; dot: string }> = {
  emerald: { ping: 'bg-emerald-400', dot: 'bg-emerald-500' },
  red: { ping: 'bg-red-400', dot: 'bg-red-500' },
  amber: { ping: 'bg-amber-400', dot: 'bg-amber-500' },
};

export function getManifestBadge(status: string) {
  switch (status) {
    case 'confirmed':
      return {
        label: 'Confirmada',
        classes:
          'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800',
      };
    case 'rejected':
      return {
        label: 'Rejeitada',
        classes:
          'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800',
      };
    default:
      return {
        label: 'Pendente',
        classes:
          'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800',
      };
  }
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

  const endOfNextMonthStart = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  if (day >= startOfNextMonth && day < endOfNextMonthStart) return 'Próximo mês';

  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function getTypeBadge(type: string): string {
  switch (type) {
    case 'CTE':
      return 'CT-e';
    case 'NFSE':
      return 'NFS-e';
    default:
      return 'NF-e';
  }
}
