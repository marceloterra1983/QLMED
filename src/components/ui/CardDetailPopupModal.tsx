'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface CardDetailPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: string;
  iconColor?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  width?: string;
}

export default function CardDetailPopupModal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconColor = 'text-primary dark:text-blue-400',
  badge,
  children,
  footerActions,
  width = 'sm:max-w-4xl',
}: CardDetailPopupModalProps) {
  const iconBgMap: Record<string, string> = {
    'text-primary dark:text-blue-400': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
    'text-primary': 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30',
    'text-indigo-500': 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30',
    'text-amber-500': 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30',
    'text-teal-500': 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30',
    'text-emerald-500': 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30',
    'text-rose-500': 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30',
    'text-orange-500': 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30',
    'text-blue-500': 'bg-blue-500/10 dark:bg-blue-500/20 ring-blue-500/20 dark:ring-blue-500/30',
    'text-purple-500': 'bg-purple-500/10 dark:bg-purple-500/20 ring-purple-500/20 dark:ring-purple-500/30',
  };
  const iconBg = iconBgMap[iconColor] || iconBgMap['text-primary dark:text-blue-400'];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      surface="sunken"
      width={width}
      height="sm:h-auto sm:max-h-[90vh]"
      zIndex="z-[60]"
      bodyClassName=""
      header={
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-sheet-top sm:shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ring-1 shrink-0 ${iconBg}`}>
                <span className={`material-symbols-outlined text-[18px] ${iconColor}`} aria-hidden="true">
                  {icon}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                    {title}
                  </h3>
                  {badge}
                </div>
                {subtitle && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar diálogo do card"
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </div>
      }
      footer={
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0">{footerActions}</div>
          <Button variant="secondary" onClick={onClose} size="sm">
            Fechar
          </Button>
        </div>
      }
    >
      <div className="p-4 sm:p-6">{children}</div>
    </Modal>
  );
}
