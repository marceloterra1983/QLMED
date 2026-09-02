'use client';

import { useEffect, useId, useRef } from 'react';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import Button from '@/components/ui/Button';
import { useDialogKeydown } from '@/hooks/useDialogKeydown';

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
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Escape + trap de Tab, o mesmo do Modal. Antes daqui só havia Escape: o Tab
  // saía do diálogo apesar do aria-modal (QLMED-UI-004).
  useDialogKeydown(isOpen, dialogRef, onClose);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isDanger = confirmVariant === 'danger';

  const iconBg = isDanger
    ? 'bg-gradient-to-br from-red-500/20 to-red-500/5 dark:from-red-500/30 dark:to-red-500/10 ring-1 ring-red-500/20 dark:ring-red-500/30'
    : 'bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 ring-1 ring-primary/20 dark:ring-primary/30';

  const iconColor = isDanger ? 'text-red-500' : 'text-primary dark:text-blue-400';
  const iconName = isDanger ? 'warning' : 'help';

  const confirmVariantName = isDanger ? 'danger' : 'primary';

  return (
    <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="absolute inset-0 sm:relative sm:inset-auto bg-white dark:bg-card-dark sm:rounded-2xl sm:shadow-2xl sm:max-w-sm sm:w-full overflow-hidden sm:ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        {/* Body */}
        <div className="flex-1 flex items-center justify-center px-6 pt-6 pb-5">
          <div className="flex flex-col items-center text-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${iconBg}`}>
              <span className={`material-symbols-outlined text-[28px] ${iconColor}`}>{iconName}</span>
            </div>
            <h3 id={titleId} className="text-base font-bold text-slate-900 dark:text-white mb-1.5">{title}</h3>
            <p id={messageId} className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-[280px]">{message}</p>
          </div>
        </div>

        {/* Actions — desktop */}
        <div className="hidden sm:flex items-center gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
          <Button onClick={onClose} variant="secondary" className="flex-1">
            {cancelLabel}
          </Button>
          <Button
            onClick={() => { onConfirm(); }}
            loading={loading}
            variant={confirmVariantName}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>

        {/* Actions — mobile fullscreen */}
        <div className="sm:hidden px-4 py-4 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20 space-y-2 shrink-0">
          <Button
            onClick={() => { onConfirm(); }}
            loading={loading}
            variant={confirmVariantName}
            size="lg"
            block
          >
            {confirmLabel}
          </Button>
          <Button onClick={onClose} variant="secondary" size="lg" block>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
