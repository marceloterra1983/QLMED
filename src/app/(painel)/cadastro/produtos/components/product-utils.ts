import React from 'react';

export function normalizeSearch(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function formatQuantity(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

export function formatDate(value: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function getAnvisaExpirationBadge(expiration: string | null | undefined): { label: string; className: string } | null {
  if (!expiration) return null;
  const trimmed = expiration.trim().toUpperCase();
  if (!trimmed || trimmed === 'N/A' || trimmed.includes('INDETERMINADA') || trimmed.includes('VIGENTE')) return null;
  // Parse DD/MM/YYYY or YYYY-MM-DD
  let date: Date | null = null;
  const brMatch = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (brMatch) date = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
  else {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) date = d;
  }
  if (!date) return null;
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: 'Vencido', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/40' };
  if (days <= 90) return { label: `${days}d`, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/40' };
  return null;
}

export function formatOptional(value: number | null) {
  if (value == null) return '-';
  // Import formatAmount at call site to avoid circular
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  try {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return text;
    const re = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(re);
    if (parts.length <= 1) return text;
    return parts.map((part, i) =>
      part.toLowerCase() === query.trim().toLowerCase()
        ? React.createElement('mark', { key: i, className: 'bg-yellow-200 dark:bg-yellow-700/60 text-inherit px-0.5 rounded' }, part)
        : part
    );
  } catch {
    return text;
  }
}

export const iconBgMap: Record<string, string> = {
  'text-primary': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
  'text-amber-500': 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
  'text-orange-500': 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30',
  'text-teal-500': 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30',
  'text-blue-500': 'bg-blue-500/10 dark:bg-blue-500/20 ring-blue-500/20 dark:ring-blue-500/30',
  'text-emerald-500': 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30',
  'text-rose-500': 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30',
  'text-violet-500': 'bg-violet-500/10 dark:bg-violet-500/20 ring-violet-500/20 dark:ring-violet-500/30',
};

export const DETAIL_INPUT_CLS = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed";

export const BULK_INPUT_CLS = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow";

export const bulkFieldIconMap: Record<string, { bg: string; color: string }> = {
  category: { bg: 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30', color: 'text-indigo-500' },
  folder: { bg: 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30', color: 'text-amber-500' },
  folder_open: { bg: 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30', color: 'text-orange-500' },
  tag: { bg: 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30', color: 'text-teal-500' },
  verified: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30', color: 'text-emerald-500' },
  toggle_on: { bg: 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30', color: 'text-rose-500' },
};

export interface HierOptions {
  lines: string[];
  allGroups: string[];
  allSubgroups: string[];
  groupsByLine: { line: string; groups: string[] }[];
  orphanGroups: string[];
  subgroupsByGroup: { group: string; subgroups: string[] }[];
  orphanSubgroups: string[];
  groupsFor: (line: string) => string[];
  subgroupsFor: (line: string, group: string) => string[];
  subgroupsForGroup: (group: string) => string[];
}
