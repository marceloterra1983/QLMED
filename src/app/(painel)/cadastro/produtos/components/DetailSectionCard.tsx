'use client';

import React from 'react';
import { iconBgMap, bulkFieldIconMap } from './product-utils';

export function DetailSectionCard({ id, icon, iconColor, title, badge, isOpen, onToggle, children }: { id: string; icon: string; iconColor: string; title: string; badge?: React.ReactNode; isOpen: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  const ibg = iconBgMap[iconColor] || iconBgMap['text-primary'];
  return (
    <div data-section-id={id} className="bg-white dark:bg-card-dark rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-800/50 overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${ibg}`}>
          <span className={`material-symbols-outlined text-[15px] ${iconColor}`}>{icon}</span>
        </div>
        <h4 className="text-[13px] font-bold text-slate-900 dark:text-white flex-1 text-left">{title}</h4>
        {badge}
        <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>expand_more</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/60">
          {children}
        </div>
      )}
    </div>
  );
}

export function DetailField({ label, children, colSpan2 }: { label: string; children: React.ReactNode; colSpan2?: boolean }) {
  return (
    <div className={`${colSpan2 ? 'col-span-2' : ''}`}>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function BulkFieldRow({ checked, onChange, icon, label, children }: { checked: boolean; onChange: (v: boolean) => void; icon: string; label: string; children?: React.ReactNode }) {
  const fm = bulkFieldIconMap[icon] || { bg: 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30', color: 'text-primary' };
  return (
    <div className={`bg-white dark:bg-card-dark rounded-2xl ring-1 overflow-hidden transition-all ${checked ? 'ring-primary/30 dark:ring-primary/40 shadow-sm shadow-primary/5' : 'ring-slate-200/60 dark:ring-slate-800/50'}`}>
      <label className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
        <div className="relative flex items-center">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${checked ? 'bg-primary border-primary scale-105' : 'border-slate-300 dark:border-slate-600'}`}>
            {checked && <span className="material-symbols-outlined text-[14px] text-white">check</span>}
          </div>
        </div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${fm.bg}`}>
          <span className={`material-symbols-outlined text-[15px] ${fm.color}`}>{icon}</span>
        </div>
        <span className={`text-[13px] font-bold transition-colors ${checked ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
      </label>
      {checked && children && (
        <div className="px-4 pb-3.5 pt-0">
          {children}
        </div>
      )}
    </div>
  );
}
