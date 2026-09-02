'use client';

import React from 'react';
import Field from '@/components/ui/Field';
import { bulkFieldIconMap } from './product-utils';


export function DetailField({ label, children, colSpan2 }: { label: string; children: React.ReactNode; colSpan2?: boolean }) {
  return (
    <Field label={label} className={colSpan2 ? 'col-span-2' : ''}>
      {children}
    </Field>
  );
}

export function BulkFieldRow({ checked, onChange, icon, label, children }: { checked: boolean; onChange: (v: boolean) => void; icon: string; label: string; children?: React.ReactNode }) {
  const fm = bulkFieldIconMap[icon] || { bg: 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30', color: 'text-primary dark:text-blue-400' };
  return (
    <div className={`bg-white dark:bg-card-dark rounded-xl ring-1 overflow-hidden transition-all ${checked ? 'ring-primary/30 dark:ring-primary/40 shadow-sm shadow-primary/5' : 'ring-slate-200/60 dark:ring-slate-800/50'}`}>
      <label className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
        <div className="relative flex items-center">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
          <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${checked ? 'bg-primary border-primary scale-105' : 'border-slate-300 dark:border-slate-600'}`}>
            {checked && <span className="material-symbols-outlined text-[14px] text-white">check</span>}
          </div>
        </div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${fm.bg}`}>
          <span className={`material-symbols-outlined text-[15px] ${fm.color}`}>{icon}</span>
        </div>
        <span className={`text-sm font-bold transition-colors ${checked ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
      </label>
      {checked && children && (
        <div className="px-4 pb-3.5 pt-0">
          {children}
        </div>
      )}
    </div>
  );
}
