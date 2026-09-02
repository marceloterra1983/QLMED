'use client';

import type { AddressDivergence } from './contact-detail-types';

// --- Shared utility functions ---

function normalizeForCompare(value: string | null | undefined): string {
  if (!value) return '';
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[.,\-\/\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function compareAddressFields(
  xmlAddr: { street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; zipCode: string | null } | null,
  apiAddr: { logradouro: string | null; numero: string | null; bairro: string | null; municipio: string | null; uf: string | null; cep: string | null } | null,
): AddressDivergence[] {
  if (!xmlAddr || !apiAddr) return [];
  const result: AddressDivergence[] = [];
  const pairs: Array<{ label: string; field: string; xml: string | null; api: string | null; isCep?: boolean }> = [
    { label: 'Logradouro', field: 'street', xml: xmlAddr.street, api: apiAddr.logradouro },
    { label: 'Numero', field: 'number', xml: xmlAddr.number, api: apiAddr.numero },
    { label: 'Bairro', field: 'district', xml: xmlAddr.district, api: apiAddr.bairro },
    { label: 'Municipio', field: 'city', xml: xmlAddr.city, api: apiAddr.municipio },
    { label: 'UF', field: 'state', xml: xmlAddr.state, api: apiAddr.uf },
    { label: 'CEP', field: 'zipCode', xml: xmlAddr.zipCode, api: apiAddr.cep, isCep: true },
  ];
  for (const p of pairs) {
    if (!p.xml && !p.api) continue;
    const match = p.isCep
      ? (p.xml || '').replace(/\D/g, '') === (p.api || '').replace(/\D/g, '')
      : normalizeForCompare(p.xml) === normalizeForCompare(p.api) || (normalizeForCompare(p.xml).includes(normalizeForCompare(p.api)) || normalizeForCompare(p.api).includes(normalizeForCompare(p.xml)));
    if (!match) result.push({ field: p.field, label: p.label, xmlValue: p.xml || '(vazio)', apiValue: p.api || '(vazio)' });
  }
  return result;
}

// --- Shared table class constants ---

export const thCls = 'px-3 py-2.5 text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400';
export const tdCls = 'px-3 py-2';

// --- Shared UI components ---

export function EditableField({ label, value, field, draft, onChange }: {
  label: string;
  value?: string | null;
  field: string;
  draft: Record<string, string>;
  onChange: (field: string, val: string) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <input
        type="text"
        value={draft[field] ?? value ?? ''}
        onChange={(e) => onChange(field, e.target.value)}
        aria-label={label}
        className="w-full px-2 py-1 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 transition-all"
      />
    </div>
  );
}


export function StatCard({ label, value, icon, color = 'primary' }: { label: string; value: string; icon: string; color?: string }) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    primary: { bg: 'bg-primary/10 dark:bg-primary/20', text: 'text-primary dark:text-blue-400', ring: 'ring-primary/20 dark:ring-primary/30' },
    indigo: { bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-500', ring: 'ring-indigo-500/20 dark:ring-indigo-500/30' },
    emerald: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-500', ring: 'ring-emerald-500/20 dark:ring-emerald-500/30' },
    amber: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-500', ring: 'ring-amber-500/20 dark:ring-amber-500/30' },
    teal: { bg: 'bg-teal-500/10 dark:bg-teal-500/20', text: 'text-teal-500', ring: 'ring-teal-500/20 dark:ring-teal-500/30' },
    orange: { bg: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-500', ring: 'ring-orange-500/20 dark:ring-orange-500/30' },
  };
  const c = colorMap[color] || colorMap.primary;

  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-900/30 p-3 ring-1 ring-slate-200/50 dark:ring-slate-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-base font-bold text-slate-900 dark:text-white mt-1 truncate">{value}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${c.bg} ${c.ring}`}>
          <span className={`material-symbols-outlined text-[17px] ${c.text}`}>{icon}</span>
        </div>
      </div>
    </div>
  );
}
