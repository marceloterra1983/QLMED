import React from 'react';

export function Field({ label, value, className = '' }: { label: string; value?: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 break-words">{value || '-'}</p>
    </div>
  );
}


