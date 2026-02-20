'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

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

export default function InvoiceDetailsModal({ isOpen, onClose, invoiceId }: InvoiceDetailsModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [view, setView] = useState<'danfe' | 'xml'>('danfe');
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [loadingXml, setLoadingXml] = useState(false);
  const [meta, setMeta] = useState<InvoiceMeta | null>(null);

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

  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-white dark:bg-card-dark rounded-t-xl sm:rounded-xl shadow-2xl w-full max-w-5xl h-full sm:h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">description</span>
            <span className="hidden sm:inline">Visualizar Documento</span>
            <span className="sm:hidden">Documento</span>
          </h3>

          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
            {/* Toggle view */}
            <button
              onClick={toggleXmlView}
              disabled={loadingXml}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                view === 'xml'
                  ? 'bg-primary text-white shadow-md shadow-primary/30'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
              title={view === 'xml' ? 'Ver DANFE' : 'Ver XML'}
            >
              <span className={`material-symbols-outlined text-[18px] ${loadingXml ? 'animate-spin' : ''}`}>
                {loadingXml ? 'progress_activity' : view === 'xml' ? 'description' : 'code'}
              </span>
              {view === 'xml' ? 'DANFE' : 'XML'}
            </button>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />

            {/* Download PDF */}
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold transition-colors"
              title="Baixar PDF"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              PDF
            </button>

            {/* Download XML */}
            <button
              onClick={handleDownloadXml}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold transition-colors"
              title="Baixar XML"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              XML
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-bold transition-colors shadow-md shadow-primary/30"
              title="Imprimir"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />

            {/* Close */}
            <button
              onClick={onClose}
              aria-label="Fechar documento"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </div>

        {/* Access Key Bar */}
        {meta?.accessKey && (
          <div className="flex items-center gap-3 px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Chave</span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300 tracking-wide truncate">
              {formatAccessKey(meta.accessKey)}
            </span>
            <button
              onClick={copyAccessKey}
              className="flex-shrink-0 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary transition-colors"
              title="Copiar chave de acesso"
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {view === 'danfe' ? (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-900">
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                className="w-full h-full border-0"
                title="Preview do documento"
              />
            </div>
          ) : (
            <div className="w-full h-full bg-[#1e1e2e] overflow-auto">
              {loadingXml ? (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
                  <span className="ml-2 text-sm">Carregando XML...</span>
                </div>
              ) : xmlHighlighted ? (
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
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <span className="material-symbols-outlined text-[48px] opacity-30">code_off</span>
                  <span className="ml-2 text-sm">XML não disponível</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
