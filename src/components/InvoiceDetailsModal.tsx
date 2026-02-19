'use client';

import { useRef } from 'react';

interface InvoiceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
}

export default function InvoiceDetailsModal({ isOpen, onClose, invoiceId }: InvoiceDetailsModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  if (!isOpen || !invoiceId) return null;

  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  const handleDownload = () => {
    window.open(`${pdfUrl}?download=true`, '_blank');
  };

  const handleDownloadXml = () => {
    window.open(`/api/invoices/${invoiceId}/download`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-white dark:bg-card-dark rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">description</span>
            Visualizar Documento
          </h3>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadXml}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold transition-colors"
              title="Baixar XML"
            >
              <span className="material-symbols-outlined text-[18px]">code</span>
              XML
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold transition-colors"
              title="Baixar documento"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Baixar
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-bold transition-colors shadow-md shadow-primary/30"
              title="Imprimir"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              Imprimir
            </button>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </div>

        {/* PDF Preview */}
        <div className="flex-1 bg-slate-200 dark:bg-slate-900">
          <iframe
            ref={iframeRef}
            src={pdfUrl}
            className="w-full h-full border-0"
            title="Preview do documento"
          />
        </div>
      </div>
    </div>
  );
}
