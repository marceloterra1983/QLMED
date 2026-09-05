'use client';

import { useState, useRef, useEffect, type JSX } from 'react';
import { toast } from 'sonner';

export type RowAction = {
  label: string;
  icon: string;
  onSelect: () => void;
  danger?: boolean;
  hideOnMobile?: boolean;
};

export function RowActionsBase({ inline, menu }: { inline: RowAction[]; menu: RowAction[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="flex items-center justify-center gap-0">
      {inline.map((action) => (
        <button
          key={action.label}
          onClick={action.onSelect}
          className={`${action.hideOnMobile ? 'hidden sm:flex ' : ''}p-1.5 rounded-lg text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/10 transition-colors`}
          title={action.label}
          aria-label={action.label}
        >
          <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
        </button>
      ))}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(!open)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/10 transition-colors"
          title="Mais opções"
          aria-label="Mais opções"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-black/30 z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
            {menu.map((item) => (
              <div key={item.label}>
                {item.danger && <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />}
                <button
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  title={item.label}
                  aria-label={item.label}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${
                    item.danger
                      ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] ${item.danger ? '' : 'text-slate-500 dark:text-slate-400'}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface RowActionsProps {
  invoiceId: string;
  accessKey?: string | null;
  onView: (id: string) => void;
  onDetails: (id: string) => void;
  onViewProducts?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function RowActions({ invoiceId, accessKey, onView, onDetails, onViewProducts, onDelete }: RowActionsProps) {
  const handlePrint = () => {
    window.open(`/api/invoices/${invoiceId}/pdf?print=true`, '_blank');
  };

  const handleSaveXml = () => {
    window.open(`/api/invoices/${invoiceId}/download`, '_blank');
  };

  const handleSavePdf = () => {
    const link = document.createElement('a');
    link.href = `/api/invoices/${invoiceId}/pdf?download=true`;
    link.click();
  };

  const handleCopyKey = () => {
    if (accessKey) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(accessKey).then(() => {
          toast.success('Chave copiada!');
        }).catch(() => {
          toast.error('Erro ao copiar chave');
        });
      } else {
        const el = document.createElement('textarea');
        el.value = accessKey;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        if (ok) toast.success('Chave copiada!');
        else toast.error('Erro ao copiar chave');
      }
    }
  };

  const inline: RowAction[] = [
    { label: 'Visualizar documento', icon: 'receipt_long', onSelect: () => onView(invoiceId) },
    ...(onViewProducts ? [{ label: 'Ver detalhes', icon: 'search', onSelect: () => onViewProducts(invoiceId) }] : []),
    { label: 'Imprimir', icon: 'print', onSelect: handlePrint, hideOnMobile: true },
  ];

  const menu: RowAction[] = [
    { label: 'Detalhes', icon: 'search', onSelect: () => onDetails(invoiceId) },
    ...(accessKey ? [{ label: 'Copiar Chave', icon: 'key', onSelect: handleCopyKey }] : []),
    { label: 'Imprimir', icon: 'print', onSelect: handlePrint },
    { label: 'Salvar XML', icon: 'code', onSelect: handleSaveXml },
    { label: 'Salvar PDF', icon: 'picture_as_pdf', onSelect: handleSavePdf },
    ...(onDelete ? [{ label: 'Excluir', icon: 'delete', onSelect: () => onDelete(invoiceId), danger: true }] : []),
  ];

  return <RowActionsBase inline={inline} menu={menu} />;
}
