'use client';

import { useRef } from 'react';
import type { AddressDivergence } from './contact-detail-types';

// --- Shared utility functions ---

export function normalizeForCompare(value: string | null | undefined): string {
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

export const thCls = 'px-3 py-2.5 text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500';
export const tdCls = 'px-3 py-2';

// --- Shared UI components ---

export function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 break-words">{value || '-'}</p>
    </div>
  );
}

export function EditableField({ label, value, field, draft, onChange }: {
  label: string;
  value?: string | null;
  field: string;
  draft: Record<string, string>;
  onChange: (field: string, val: string) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <input
        type="text"
        value={draft[field] ?? value ?? ''}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full px-2 py-1 text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
      />
    </div>
  );
}

interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon: string;
  iconColor?: string;
  open: boolean;
  onToggle: () => void;
  badge?: string | number;
  children: React.ReactNode;
}

export function SectionCard({ title, subtitle, icon, iconColor = 'text-primary', open, onToggle, badge, children }: SectionCardProps) {
  const hasBeenOpened = useRef(open);
  if (open && !hasBeenOpened.current) hasBeenOpened.current = true;

  const iconBgMap: Record<string, string> = {
    'text-primary': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
    'text-indigo-500': 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30',
    'text-amber-500': 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
    'text-teal-500': 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30',
    'text-emerald-500': 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30',
    'text-rose-500': 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30',
    'text-orange-500': 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30',
  };
  const iconBg = iconBgMap[iconColor] || iconBgMap['text-primary'];

  return (
    <div className={`bg-white dark:bg-card-dark rounded-2xl overflow-hidden ring-1 transition-all ${open ? 'ring-slate-200/80 dark:ring-slate-700/60 shadow-sm' : 'ring-slate-200/50 dark:ring-slate-800/50'}`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ring-1 shrink-0 ${iconBg}`}>
          <span className={`material-symbols-outlined text-[17px] ${open ? iconColor : 'text-slate-400 dark:text-slate-500'} transition-colors`}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-bold text-slate-900 dark:text-white">{title}</p>
            {badge !== undefined && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      <div className={`transition-all duration-200 ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-4 pb-4 pt-1">{hasBeenOpened.current ? children : null}</div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon, color = 'primary' }: { label: string; value: string; icon: string; color?: string }) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    primary: { bg: 'bg-primary/10 dark:bg-primary/20', text: 'text-primary', ring: 'ring-primary/20 dark:ring-primary/30' },
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
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-base font-bold text-slate-900 dark:text-white mt-1 truncate">{value}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${c.bg} ${c.ring}`}>
          <span className={`material-symbols-outlined text-[17px] ${c.text}`}>{icon}</span>
        </div>
      </div>
    </div>
  );
}
