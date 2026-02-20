'use client';

import { useState, ReactNode } from 'react';

interface CollapsibleCardProps {
  icon: string;
  title: string;
  defaultOpen?: boolean;
  variant?: 'normal' | 'danger';
  badge?: { label: string; color: 'green' | 'red' | 'yellow' };
  children: ReactNode;
}

export default function CollapsibleCard({
  icon,
  title,
  defaultOpen = false,
  variant = 'normal',
  badge,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isDanger = variant === 'danger';

  const borderClass = isDanger
    ? 'border-2 border-red-200 dark:border-red-900/50'
    : 'border border-slate-200 dark:border-slate-800';

  const titleClass = isDanger
    ? 'text-red-600 dark:text-red-400'
    : 'text-slate-900 dark:text-white';

  const iconClass = isDanger
    ? 'text-red-500 dark:text-red-400'
    : 'text-primary';

  const badgeColors = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  };

  return (
    <div className={`bg-white dark:bg-card-dark rounded-xl ${borderClass} shadow-sm`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className={`material-symbols-outlined text-[22px] ${iconClass}`}>{icon}</span>
          <h3 className={`font-bold text-[15px] ${titleClass}`}>{title}</h3>
          {badge && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${badgeColors[badge.color]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                badge.color === 'green' ? 'bg-green-500' : badge.color === 'red' ? 'bg-red-500' : 'bg-yellow-500'
              }`} />
              {badge.label}
            </span>
          )}
        </div>
        <span
          className={`material-symbols-outlined text-[20px] text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className={`border-t p-4 ${isDanger ? 'border-red-200 dark:border-red-900/50' : 'border-slate-200 dark:border-slate-800'}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
