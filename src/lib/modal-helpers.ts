/**
 * Shared formatting helpers used by Customer/Supplier Details and PriceTable modals.
 */

import { formatCnpj } from '@/lib/utils';

export function formatDocument(document: string) {
  const digits = (document || '').replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return document || '-';
}

export function formatQuantity(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function normalizeDateOnly(value: string | null): Date | null {
  if (!value) return null;

  const onlyDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (onlyDate) {
    const year = Number(onlyDate[1]);
    const month = Number(onlyDate[2]);
    const day = Number(onlyDate[3]);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function formatDueDate(value: string | null): string {
  if (!value) return '-';
  const parsed = normalizeDateOnly(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function getDuplicateStatus(value: string | null): { label: 'A vencer' | 'Vencido'; classes: string } {
  const dueDate = normalizeDateOnly(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueDate && dueDate < today) {
    return {
      label: 'Vencido',
      classes: 'bg-red-50 text-red-600 ring-1 ring-red-500/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/30',
    };
  }

  return {
    label: 'A vencer',
    classes: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/30',
  };
}

export function formatInstallmentCode(value: string): string {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '001';
  return digits.slice(-3).padStart(3, '0');
}

export function formatInstallmentDisplay(installmentNumber: string, installmentTotal: number): string {
  const current = formatInstallmentCode(installmentNumber);
  if (installmentTotal > 1) {
    return `${current} / ${String(installmentTotal).padStart(3, '0')}`;
  }
  return current;
}
