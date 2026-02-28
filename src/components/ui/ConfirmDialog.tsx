'use client';

import { useEffect } from 'react';
import { useModalBackButton } from '@/hooks/useModalBackButton';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  loading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  useModalBackButton(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDanger = confirmVariant === 'danger';

  const iconBg = isDanger
    ? 'bg-gradient-to-br from-red-500/20 to-red-500/5 dark:from-red-500/30 dark:to-red-500/10 ring-1 ring-red-500/20 dark:ring-red-500/30'
    : 'bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 ring-1 ring-primary/20 dark:ring-primary/30';

  const iconColor = isDanger ? 'text-red-500' : 'text-primary';
  const iconName = isDanger ? 'warning' : 'help';

  const confirmCls = isDanger
    ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/25'
    : 'bg-primary hover:bg-primary-dark text-white shadow-sm shadow-primary/25';

  return (
    <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute inset-0 sm:relative sm:inset-auto bg-white dark:bg-[#1e2235] sm:rounded-2xl sm:shadow-2xl sm:max-w-sm sm:w-full overflow-hidden sm:ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Body */}
        <div className="flex-1 flex items-center justify-center px-6 pt-6 pb-5">
          <div className="flex flex-col items-center text-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${iconBg}`}>
              <span className={`material-symbols-outlined text-[28px] ${iconColor}`}>{iconName}</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">{title}</h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-[280px]">{message}</p>
          </div>
        </div>

        {/* Actions — desktop */}
        <div className="hidden sm:flex items-center gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); }}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-50 ${confirmCls}`}
          >
            {loading && <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>}
            {confirmLabel}
          </button>
        </div>

        {/* Actions — mobile fullscreen */}
        <div className="sm:hidden px-4 py-4 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20 space-y-2 shrink-0">
          <button
            onClick={() => { onConfirm(); }}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 py-3.5 text-base font-bold rounded-xl transition-all disabled:opacity-50 ${confirmCls}`}
          >
            {loading && <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>}
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3.5 text-base font-medium text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
