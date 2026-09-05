'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';

type CertidaoPdfModalProps = {
  isOpen: boolean;
  onClose: () => void;
  documentId: string | null;
  title: string;
};

function arquivoUrl(id: string, download = false): string {
  return download ? `/api/documentos/${id}/arquivo?download=1` : `/api/documentos/${id}/arquivo`;
}

export default function CertidaoPdfModal({ isOpen, onClose, documentId, title }: CertidaoPdfModalProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (isOpen && documentId) {
      setLoading(true);
      setError(false);
    }
  }, [isOpen, documentId]);

  if (!isOpen || !documentId) return null;

  const pdfUrl = arquivoUrl(documentId);
  const iframeSrc = isMobile
    ? `/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`
    : pdfUrl;

  // A rota /arquivo só conhece ?download=1; ?print=true era ignorado.
  // O PDF já está no iframe — imprimir o visualizador é o caminho mínimo.
  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const handleDownloadPdf = () => {
    window.open(arquivoUrl(documentId, true), '_blank');
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      surface="sunken"
      width="sm:max-w-5xl"
      height="sm:h-[92vh]"
      bodyClassName="flex flex-col flex-1 h-full min-h-0 overflow-hidden"
      header={(
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-sheet-top sm:shadow-none">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30 shrink-0 hidden sm:flex">
                <span className="material-symbols-outlined text-[22px] text-primary dark:text-blue-400">picture_as_pdf</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                  {title}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">PDF</span>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
              <Button
                onClick={handleDownloadPdf}
                variant="secondary"
                size="sm"
                title="Baixar PDF"
              >
                <span className="material-symbols-outlined text-[16px] text-rose-500">picture_as_pdf</span>
                <span className="hidden md:inline">PDF</span>
              </Button>
              <Button onClick={handlePrint} size="sm" title="Imprimir" icon="print">
                <span className="hidden md:inline">Imprimir</span>
              </Button>

              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

              <button
                onClick={onClose}
                aria-label="Fechar documento"
                className="hidden sm:flex p-2 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Fechar"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>
        </div>
      )}
      footer={(
        <div className="sm:hidden px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-sheet-bottom">
          <Button onClick={onClose} icon="arrow_back" size="lg" block>
            Voltar
          </Button>
        </div>
      )}
    >
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        <div className="w-full h-full flex-1 min-h-0 bg-slate-200 dark:bg-slate-900 relative">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Não foi possível carregar o PDF
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setError(false);
                  setLoading(true);
                }}
              >
                Tentar de novo
              </Button>
            </div>
          ) : (
            <>
              {loading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <Spinner size="lg" label="Carregando PDF" />
                </div>
              ) : null}
              <iframe
                ref={iframeRef}
                src={iframeSrc}
                className="w-full h-full min-h-0 border-0 block"
                title="Preview do documento"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setError(true);
                }}
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
