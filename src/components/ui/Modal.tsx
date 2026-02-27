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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-transparent sm:bg-slate-900/50 sm:backdrop-blur-sm transition-opacity">
      <div
        className="absolute inset-0 hidden sm:block"
        onClick={onClose}
        aria-hidden="true"
      ></div>
      <div
        ref={modalRef}
        className={`relative bg-white dark:bg-card-dark rounded-none sm:rounded-xl shadow-2xl w-full ${width} h-full sm:h-auto max-h-screen sm:max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            {/* Back button - mobile only */}
            <button
              onClick={onClose}
              className="sm:hidden p-1 -ml-1 mr-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              aria-label="Voltar"
            >
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {title}
            </h3>
          </div>
          {/* Close button - desktop only */}
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
      </div>
    </div>
  );
}
