import { useEffect, useRef } from 'react';
import { useModalBackButton } from '@/hooks/useModalBackButton';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
}

export default function Modal({ isOpen, onClose, title, children, width = 'max-w-3xl' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useModalBackButton(isOpen, onClose);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-slate-900/50 sm:backdrop-blur-sm">
      <div
        className="absolute inset-0 hidden sm:block"
        onClick={onClose}
        aria-hidden="true"
      ></div>
      <div
        ref={modalRef}
        className={`relative bg-white dark:bg-card-dark sm:rounded-xl w-full ${width} h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:shadow-2xl sm:animate-in sm:fade-in sm:zoom-in-95 duration-200`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header - 3D raised effect on mobile */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="hidden sm:flex p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {children}
        </div>

        {/* Footer - mobile only */}
        <div className="sm:hidden px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white font-bold text-base active:bg-primary-dark transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
