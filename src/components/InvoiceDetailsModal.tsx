'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useModalBackButton } from '@/hooks/useModalBackButton';

interface InvoiceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
}

interface InvoiceMeta {
  accessKey: string;
  number: string;
  type: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatAccessKey(key: string): string {
  return key.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function formatAndHighlightXml(xml: string): { html: string; lineCount: number } {
  let formatted = '';
  let indent = 0;
  const raw = xml.replace(/>\s*</g, '><');
  const parts = raw.split(/(<[^>]+>)/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('</')) {
      indent = Math.max(0, indent - 1);
      formatted += '  '.repeat(indent) + trimmed + '\n';
    } else if (trimmed.startsWith('<?')) {
      formatted += '  '.repeat(indent) + trimmed + '\n';
    } else if (trimmed.startsWith('<') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
      formatted += '  '.repeat(indent) + trimmed + '\n';
      indent++;
    } else if (trimmed.startsWith('<') && trimmed.endsWith('/>')) {
      formatted += '  '.repeat(indent) + trimmed + '\n';
    } else {
      formatted += '  '.repeat(indent) + trimmed + '\n';
    }
  }

  const lines = formatted.split('\n').filter(l => l.length > 0);
  const highlighted = lines.map((line) => {
    const leadingSpaces = line.match(/^(\s*)/)?.[1] || '';
    const content = line.trimStart();
    if (!content) return leadingSpaces;

    let result = content;

    if (result.startsWith('<?')) {
      result = `<span class="xml-decl">${escapeHtml(result)}</span>`;
    } else if (result.startsWith('</')) {
      result = result.replace(
        /^<\/([^\s>]+)>/,
        (_, tag) => `<span class="xml-bracket">&lt;/</span><span class="xml-tag">${escapeHtml(tag)}</span><span class="xml-bracket">&gt;</span>`
      );
    } else if (result.startsWith('<')) {
      result = result.replace(
        /^<([^\s>/]+)((?:\s+[^>]*?)?)(\s*\/?)>$/,
        (_, tag, attrs, selfClose) => {
          let attrHtml = '';
          if (attrs) {
            attrHtml = attrs.replace(
              /\s+([\w:-]+)="([^"]*)"/g,
              (_m: string, name: string, val: string) =>
                ` <span class="xml-attr">${escapeHtml(name)}</span>=<span class="xml-val">"${escapeHtml(val)}"</span>`
            );
          }
          const close = selfClose ? '/' : '';
          return `<span class="xml-bracket">&lt;</span><span class="xml-tag">${escapeHtml(tag)}</span>${attrHtml}<span class="xml-bracket">${close}&gt;</span>`;
        }
      );
    } else {
      result = `<span class="xml-text">${escapeHtml(result)}</span>`;
    }

    return leadingSpaces.replace(/ /g, '&nbsp;') + result;
  });

  return { html: highlighted.join('\n'), lineCount: lines.length };
}

const DOC_THEME: Record<string, { icon: string; label: string; gradient: string; ring: string; text: string; pdfLabel: string }> = {
  NFE: {
    icon: 'description',
    label: 'NF-e',
    gradient: 'from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10',
    ring: 'ring-primary/20 dark:ring-primary/30',
    text: 'text-primary',
    pdfLabel: 'DANFE',
  },
  CTE: {
    icon: 'local_shipping',
    label: 'CT-e',
    gradient: 'from-teal-500/20 to-teal-500/5 dark:from-teal-500/30 dark:to-teal-500/10',
    ring: 'ring-teal-500/20 dark:ring-teal-500/30',
    text: 'text-teal-500',
    pdfLabel: 'DACTE',
  },
  NFSE: {
    icon: 'receipt_long',
    label: 'NFS-e',
    gradient: 'from-violet-500/20 to-violet-500/5 dark:from-violet-500/30 dark:to-violet-500/10',
    ring: 'ring-violet-500/20 dark:ring-violet-500/30',
    text: 'text-violet-500',
    pdfLabel: 'PDF',
  },
};

const DEFAULT_THEME = DOC_THEME.NFE;

export default function InvoiceDetailsModal({ isOpen, onClose, invoiceId }: InvoiceDetailsModalProps) {
  useModalBackButton(isOpen, onClose);
  const [view, setView] = useState<'danfe' | 'xml'>('danfe');
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [loadingXml, setLoadingXml] = useState(false);
  const [meta, setMeta] = useState<InvoiceMeta | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (isOpen && invoiceId) {
      setView('danfe');
      setXmlContent(null);
      setMeta(null);
      fetch(`/api/invoices/${invoiceId}`)
        .then(res => res.json())
        .then(data => {
          if (data.accessKey) {
            setMeta({ accessKey: data.accessKey, number: data.number, type: data.type });
          }
        })
        .catch(() => {});
    }
  }, [isOpen, invoiceId]);

  const xmlHighlighted = useMemo(() => {
    if (!xmlContent) return null;
    return formatAndHighlightXml(xmlContent);
  }, [xmlContent]);

  if (!isOpen || !invoiceId) return null;

  const theme = (meta?.type ? DOC_THEME[meta.type] : null) || DEFAULT_THEME;
  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;
  const iframeSrc = isMobile ? `${pdfUrl}?format=html` : pdfUrl;

  const handlePrint = () => {
    window.open(`${pdfUrl}?print=true`, '_blank');
  };

  const handleDownloadPdf = () => {
    window.open(`${pdfUrl}?download=true`, '_blank');
  };

  const handleDownloadXml = () => {
    const link = document.createElement('a');
    link.href = `/api/invoices/${invoiceId}/download`;
    link.download = '';
    link.click();
  };

  const toggleXmlView = async () => {
    if (view === 'xml') {
      setView('danfe');
      return;
    }

    if (!xmlContent) {
      setLoadingXml(true);
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/download`);
        if (res.ok) {
          const text = await res.text();
          setXmlContent(text);
        }
      } catch {
        // silently fail
      } finally {
        setLoadingXml(false);
      }
    }
    setView('xml');
  };

  const copyAccessKey = () => {
    if (!meta?.accessKey) return;
    const text = meta.accessKey;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast.success('Chave copiada!'));
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Chave copiada!');
    }
  };

  const copyXml = () => {
    if (!xmlContent) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(xmlContent).then(() => toast.success('XML copiado!'));
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = xmlContent;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('XML copiado!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-black/60 sm:backdrop-blur-sm">
      <div
        className="absolute inset-0 hidden sm:block"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 sm:relative sm:inset-auto bg-slate-50 dark:bg-[#1a1e2e] sm:rounded-2xl w-full sm:max-w-5xl sm:h-[92vh] flex flex-col overflow-hidden sm:shadow-2xl sm:ring-1 ring-black/5 dark:ring-white/5"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            {/* Left: Icon + Title */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center ring-1 ${theme.ring} shrink-0 hidden sm:flex`}>
                <span className={`material-symbols-outlined text-[22px] ${theme.text}`}>{theme.icon}</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-[13px] sm:text-[15px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                  {meta?.number ? `${theme.label} ${meta.number}` : 'Visualizar Documento'}
                </h3>
                <span className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
                  {view === 'danfe' ? theme.pdfLabel : 'XML'}
                </span>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* DANFE / XML toggle */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                <button
                  onClick={() => view === 'xml' && toggleXmlView()}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-[12px] font-bold transition-all ${
                    view === 'danfe'
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px] sm:text-[15px]">description</span>
                  <span>{theme.pdfLabel}</span>
                </button>
                <button
                  onClick={() => view === 'danfe' && toggleXmlView()}
                  disabled={loadingXml}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-[12px] font-bold transition-all ${
                    view === 'xml'
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[14px] sm:text-[15px] ${loadingXml ? 'animate-spin' : ''}`}>
                    {loadingXml ? 'progress_activity' : 'code'}
                  </span>
                  <span>XML</span>
                </button>
              </div>

              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

              {/* Action buttons */}
              <button
                onClick={handleDownloadPdf}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-[13px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                title="Baixar PDF"
              >
                <span className="material-symbols-outlined text-[14px] sm:text-[16px] text-rose-500">picture_as_pdf</span>
                <span className="hidden md:inline">PDF</span>
              </button>
              <button
                onClick={handleDownloadXml}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-[13px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                title="Baixar XML"
              >
                <span className="material-symbols-outlined text-[14px] sm:text-[16px] text-amber-500">data_object</span>
                <span className="hidden md:inline">XML</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-[13px] font-bold bg-gradient-to-r from-primary to-primary-dark text-white shadow-sm shadow-primary/25 hover:shadow-md hover:shadow-primary/30 transition-all"
                title="Imprimir"
              >
                <span className="material-symbols-outlined text-[14px] sm:text-[16px]">print</span>
                <span className="hidden md:inline">Imprimir</span>
              </button>

              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

              <button
                onClick={onClose}
                aria-label="Fechar documento"
                className="hidden sm:flex p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Fechar"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>

          {/* Access Key Bar - hidden on mobile, shown on sm+ */}
          {meta?.accessKey && (
            <div className="hidden sm:flex items-center gap-2.5 mt-3 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
              <span className="material-symbols-outlined text-[14px] text-slate-400">key</span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Chave</span>
              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 tracking-wider truncate select-all">
                {formatAccessKey(meta.accessKey)}
              </span>
              <button
                onClick={copyAccessKey}
                className={`flex-shrink-0 p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:${theme.text} transition-colors`}
                title="Copiar chave de acesso"
              >
                <span className="material-symbols-outlined text-[15px]">content_copy</span>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {view === 'danfe' ? (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-900">
              <iframe
                src={iframeSrc}
                className="w-full h-full border-0"
                title="Preview do documento"
              />
            </div>
          ) : (
            <div className="w-full h-full bg-[#1e1e2e] overflow-auto relative">
              {loadingXml ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center ring-1 ring-amber-500/20 dark:ring-amber-500/30">
                    <span className="material-symbols-outlined text-[28px] text-amber-500 animate-spin">progress_activity</span>
                  </div>
                  <p className="text-[13px] font-medium text-slate-500">Carregando XML...</p>
                </div>
              ) : xmlHighlighted ? (
                <>
                  {/* Floating copy button */}
                  <button
                    onClick={copyXml}
                    className="absolute top-3 right-5 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#313244] hover:bg-[#45475a] text-[11px] font-bold text-slate-400 hover:text-slate-200 transition-all ring-1 ring-[#45475a]"
                    title="Copiar XML"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    Copiar
                  </button>
                  <div className="flex h-full">
                    {/* Line numbers */}
                    <div className="flex-shrink-0 py-4 pr-0 select-none border-r border-[#313244]">
                      <pre className="text-[11px] font-mono leading-[1.6] text-[#6c7086] text-right px-3">
                        {Array.from({ length: xmlHighlighted.lineCount }, (_, i) => i + 1).join('\n')}
                      </pre>
                    </div>
                    {/* Code content */}
                    <div className="flex-1 overflow-auto py-4 px-4">
                      <style dangerouslySetInnerHTML={{ __html: `
                        .xml-code .xml-bracket { color: #6c7086; }
                        .xml-code .xml-tag { color: #89b4fa; font-weight: 600; }
                        .xml-code .xml-attr { color: #f9e2af; }
                        .xml-code .xml-val { color: #a6e3a1; }
                        .xml-code .xml-text { color: #cdd6f4; }
                        .xml-code .xml-decl { color: #9399b2; }
                      `}} />
                      <pre
                        className="xml-code text-[11px] font-mono leading-[1.6] whitespace-pre"
                        dangerouslySetInnerHTML={{ __html: xmlHighlighted.html }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-700/50 flex items-center justify-center ring-1 ring-slate-600/50">
                    <span className="material-symbols-outlined text-[28px] text-slate-500">code_off</span>
                  </div>
                  <p className="text-[13px] font-medium text-slate-500">XML não disponível</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - mobile only */}
        <div className="sm:hidden px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white font-bold text-base active:bg-primary-dark transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
