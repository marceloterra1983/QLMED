'use client';

import { useState, useEffect, useMemo } from 'react';
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

  const ActionButton = ({ onClick, icon, label, variant = 'default', disabled }: { onClick: () => void; icon: string; label: string; variant?: 'default' | 'primary' | 'active'; disabled?: boolean }) => {
    const cls = variant === 'primary'
      ? 'bg-primary hover:bg-primary-dark text-white shadow-sm shadow-primary/25'
      : variant === 'active'
        ? 'bg-primary text-white shadow-sm shadow-primary/25'
        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600';
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-50 ${cls}`}
        title={label}
      >
        <span className={`material-symbols-outlined text-[17px] ${disabled ? 'animate-spin' : ''}`}>{icon}</span>
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-slate-50 dark:bg-[#1a1e2e] rounded-none sm:rounded-2xl shadow-2xl w-full max-w-5xl h-full sm:h-[92vh] flex flex-col overflow-hidden ring-0 sm:ring-1 ring-black/5 dark:ring-white/5"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-white dark:bg-card-dark border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 flex items-center justify-center ring-1 ring-primary/20 dark:ring-primary/30">
                <span className="material-symbols-outlined text-[22px] text-primary">description</span>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">
                  {meta?.number ? `NF-e ${meta.number}` : 'Visualizar Documento'}
                </h3>
                {meta?.type && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{meta.type === 'entrada' ? 'Nota de Entrada' : meta.type === 'saida' ? 'Nota de Saída' : meta.type}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* View toggle */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 ring-1 ring-slate-200/50 dark:ring-slate-700/50">
                <button
                  onClick={() => view === 'xml' && toggleXmlView()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    view === 'danfe'
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">description</span>
                  DANFE
                </button>
                <button
                  onClick={() => view === 'danfe' && toggleXmlView()}
                  disabled={loadingXml}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    view === 'xml'
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[15px] ${loadingXml ? 'animate-spin' : ''}`}>
                    {loadingXml ? 'sync' : 'code'}
                  </span>
                  XML
                </button>
              </div>

              <div className="w-px h-7 bg-slate-200 dark:bg-slate-700 mx-1" />

              <ActionButton onClick={handleDownloadPdf} icon="picture_as_pdf" label="PDF" />
              <ActionButton onClick={handleDownloadXml} icon="data_object" label="XML" />
              <ActionButton onClick={handlePrint} icon="print" label="Imprimir" variant="primary" />

              <div className="w-px h-7 bg-slate-200 dark:bg-slate-700 mx-1" />

              <button
                onClick={onClose}
                aria-label="Fechar documento"
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Fechar"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>

          {/* Access Key Bar */}
          {meta?.accessKey && (
            <div className="flex items-center gap-2.5 mt-3 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
              <span className="material-symbols-outlined text-[14px] text-slate-400">key</span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Chave</span>
              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 tracking-wider truncate select-all">
                {formatAccessKey(meta.accessKey)}
              </span>
              <button
                onClick={copyAccessKey}
                className="flex-shrink-0 p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:text-primary transition-colors"
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
                src={pdfUrl}
                className="w-full h-full border-0"
                title="Preview do documento"
              />
            </div>
          ) : (
            <div className="w-full h-full bg-[#1e1e2e] overflow-auto">
              {loadingXml ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <span className="material-symbols-outlined text-[36px] text-slate-500 animate-spin">sync</span>
                  <span className="text-[13px] text-slate-500">Carregando XML...</span>
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
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <span className="material-symbols-outlined text-[40px] text-slate-600">code_off</span>
                  <span className="text-[13px] text-slate-500">XML não disponível</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
