'use client';

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';

interface RowActionsProps {
  invoiceId: string;
  onView: (id: string) => void;
  onDetails: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function RowActions({ invoiceId, onView, onDetails, onDelete }: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handlePrint = () => {
    const printWindow = window.open(`/api/invoices/${invoiceId}/pdf`, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  };

  const handleSaveXml = () => {
    window.open(`/api/invoices/${invoiceId}/download`, '_blank');
    setOpen(false);
  };

  const handleSavePdf = () => {
    const link = document.createElement('a');
    link.href = `/api/invoices/${invoiceId}/pdf`;
    link.download = `nota-${invoiceId}.pdf`;
    link.click();
    setOpen(false);
  };

  const handleDetails = () => {
    onDetails(invoiceId);
    setOpen(false);
  };

  const handleForward = () => {
    toast.info('Funcionalidade de encaminhar em desenvolvimento');
    setOpen(false);
  };

  const handleNotes = () => {
    toast.info('Funcionalidade de anotações em desenvolvimento');
    setOpen(false);
  };

  const menuItems = [
    { label: 'Detalhes', icon: 'search', action: handleDetails },
    { label: 'Salvar XML', icon: 'code', action: handleSaveXml },
    { label: 'Salvar PDF', icon: 'picture_as_pdf', action: handleSavePdf },
    { label: 'Encaminhar', icon: 'forward_to_inbox', action: handleForward },
    { label: 'Anotações', icon: 'edit_note', action: handleNotes },
    { label: 'Excluir', icon: 'delete', action: () => { onDelete(invoiceId); setOpen(false); }, danger: true },
  ];

  return (
    <div className="flex items-center justify-center gap-0">
      <button
        onClick={() => onView(invoiceId)}
        className="p-1.5 rounded-md text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
        title="Visualizar documento"
        aria-label="Visualizar documento"
      >
        <span className="material-symbols-outlined text-[18px]">visibility</span>
      </button>
      <button
        onClick={handlePrint}
        className="p-1.5 rounded-md text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
        title="Imprimir"
        aria-label="Imprimir PDF"
      >
        <span className="material-symbols-outlined text-[18px]">print</span>
      </button>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(!open)}
          className="p-1.5 rounded-md text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
          title="Mais opções"
          aria-label="Mais opções"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-black/30 z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
            {menuItems.map((item, i) => (
              <div key={item.label}>
                {item.danger && <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />}
                <button
                  onClick={item.action}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${
                    item.danger
                      ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] ${item.danger ? '' : 'text-slate-400 dark:text-slate-500'}`}>
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
