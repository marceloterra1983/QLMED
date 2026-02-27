'use client';

import { useState, ReactNode } from 'react';

interface MobileFilterWrapperProps {
  children: ReactNode;
  activeFilterCount?: number;
  title?: string;
  icon?: string;
}

export default function MobileFilterWrapper({
  children,
  activeFilterCount = 0,
  title = 'Filtros',
  icon = 'filter_alt',
}: MobileFilterWrapperProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors md:hidden"
      >
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
          <span className="font-bold text-sm text-slate-900 dark:text-white">{title}</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold">
              {activeFilterCount}
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

      {/* Content: collapsible on mobile, always visible on desktop */}
      <div
        className={`grid transition-all duration-200 ease-in-out md:grid-rows-[1fr] md:opacity-100 ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 md:grid-rows-[1fr] md:opacity-100'
        }`}
      >
        <div className="overflow-hidden md:overflow-visible">
          <div className="p-4 pt-0 md:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
