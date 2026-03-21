import React from 'react';

export function Field({ label, value, className = '' }: { label: string; value?: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 break-words">{value || '-'}</p>
    </div>
  );
}

const bgMap: Record<string, string> = {
  'text-primary': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
  'text-indigo-500': 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30',
  'text-teal-500': 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30',
  'text-amber-500': 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
  'text-emerald-500': 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30',
  'text-rose-500': 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30',
  'text-orange-500': 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30',
  'text-violet-500': 'bg-violet-500/10 dark:bg-violet-500/20 ring-violet-500/20 dark:ring-violet-500/30',
  'text-blue-500': 'bg-blue-500/10 dark:bg-blue-500/20 ring-blue-500/20 dark:ring-blue-500/30',
};

export function SectionBlock({ title, icon, iconColor = 'text-primary', children }: { title: string; icon: string; iconColor?: string; children: React.ReactNode }) {
  const bg = bgMap[iconColor] || bgMap['text-primary'];

  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-800/50 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800/60">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${bg}`}>
          <span className={`material-symbols-outlined text-[15px] ${iconColor}`}>{icon}</span>
        </div>
        <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">{title}</h4>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
