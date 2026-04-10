import { formatCurrency } from '@/lib/utils';

export interface Duplicata {
  invoiceId: string;
  accessKey: string;
  nfNumero: string;
  emitenteCnpj?: string;
  emitenteNome?: string;
  clienteCnpj?: string;
  clienteNome?: string;
  nfEmissao: string;
  nfValorTotal: number;
  faturaNumero: string;
  faturaValorOriginal: number;
  faturaValorLiquido: number;
  dupNumero: string;
  dupNumeroOriginal: string;
  dupVencimento: string;
  dupVencimentoOriginal: string;
  dupValor: number;
  dupDesconto?: number;
  status: 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
  diasAtraso: number;
  diasParaVencer: number;
  parcelaTotal?: number;
}

export interface InvoiceHeader {
  id: string;
  number: string;
  issueDate: string;
  totalValue: number;
  emitenteNome?: string;
  emitenteCnpj?: string;
  clienteNome?: string;
  clienteCnpj?: string;
}

export interface DuplicataEditForm {
  id: string;
  invoiceId: string;
  dupNumeroOriginal: string;
  dupVencimentoOriginal: string;
  dupNumero: string;
  dupVencimento: string;
  dupValor: string;
  dupDesconto: string;
}

export interface Summary {
  total: number;
  totalValor: number;
  hoje: number;
  hojeValor: number;
  estaSemana: number;
  estaSemanaValor: number;
  esteMes: number;
  esteMesValor: number;
  proximoMes: number;
  proximoMesValor: number;
  vencidas: number;
  vencidasValor: number;
  venceHoje: number;
  venceHojeValor: number;
  aVencer: number;
  aVencerValor: number;
}

export const statusConfig: Record<string, { label: string; classes: string; icon: string; dotClass?: string }> = {
  overdue: {
    label: 'Vencida',
    classes: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800',
    icon: 'error',
    dotClass: 'bg-red-500',
  },
  due_today: {
    label: 'Vence Hoje',
    classes: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800',
    icon: 'schedule',
    dotClass: 'bg-amber-500',
  },
  due_soon: {
    label: 'Próxima',
    classes: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800',
    icon: 'upcoming',
    dotClass: 'bg-orange-500',
  },
  upcoming: {
    label: 'A Vencer',
    classes: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800',
    icon: 'check_circle',
    dotClass: 'bg-emerald-500',
  },
};

export function parseCurrencyInput(value: string): number {
  const text = String(value || '').trim();
  if (!text) return Number.NaN;
  const sanitized = text
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/[^0-9,.-]/g, '');

  const normalized = (() => {
    if (sanitized.includes(',')) {
      return sanitized.replace(/\./g, '').replace(',', '.');
    }
    if (!sanitized.includes('.')) {
      return sanitized;
    }
    const parts = sanitized.split('.');
    const decimalPart = parts[parts.length - 1];
    if (decimalPart.length <= 2) {
      return `${parts.slice(0, -1).join('')}.${decimalPart}`;
    }
    return parts.join('');
  })();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toCurrencyInput(value: number): string {
  if (!Number.isFinite(value)) return '';
  return formatCurrency(roundMoney(value));
}

export function getNextDupNumero(rows: Array<Pick<DuplicataEditForm, 'dupNumero'>>): string {
  const maxNumber = rows.reduce((max, row) => {
    const digits = String(row.dupNumero || '').replace(/\D/g, '');
    const parsed = digits ? parseInt(digits, 10) : Number.NaN;
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return String(maxNumber + 1).padStart(3, '0');
}

export function createEditRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatVencimento(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function formatParcela(dup: Duplicata): string {
  const digits = (dup.dupNumero || '').replace(/\D/g, '');
  const parsed = digits ? parseInt(digits, 10) : Number.NaN;
  const parcelaAtual = Number.isFinite(parsed)
    ? String(parsed).padStart(3, '0')
    : (dup.dupNumero || '001');
  const parcelaTotal = Math.max(1, dup.parcelaTotal || 1);
  return parcelaTotal > 1
    ? `${parcelaAtual} / ${String(parcelaTotal).padStart(3, '0')}`
    : parcelaAtual;
}

export function getParcelaLabel(dupNumero: string, idx: number, total: number): string {
  const digits = (dupNumero || '').replace(/\D/g, '');
  const parsed = digits ? parseInt(digits, 10) : Number.NaN;
  const parcelaAtual = Number.isFinite(parsed)
    ? String(parsed).padStart(3, '0')
    : String(idx + 1).padStart(3, '0');
  if (total <= 1) return parcelaAtual;
  return `${parcelaAtual} / ${String(total).padStart(3, '0')}`;
}

/** Get display name for a CNPJ using the nicknames map */
export function getNick(
  cnpj: string | null | undefined,
  name: string | null | undefined,
  nicknames: Map<string, string>,
): { display: string; full: string | null } {
  const full = (name || '').trim() || '-';
  if (!cnpj) return { display: full, full: null };
  const nick = nicknames.get(cnpj);
  if (nick) return { display: nick, full };
  const isCpf = cnpj.replace(/\D/g, '').length === 11;
  return isCpf ? { display: 'PARTICULAR', full } : { display: full, full: null };
}
