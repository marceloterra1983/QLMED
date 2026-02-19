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
