'use client';

import { useCallback, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { formatInt } from '@/lib/utils';

type SpicaImportSummary = {
  totalRows: number;
  inserted: number;
  updatedExisting: number;
  unchanged: number;
  quarantinedDuplicates: number;
  warningsCount: number;
};

type SpicaImportResponse = {
  dryRun: boolean;
  checksum: string;
  summary: SpicaImportSummary;
  samples?: Array<{ codigo: string; ref: string; action: string; productKey: string }>;
  error?: string;
};

interface ImportSpicaModalProps {
  onClose: () => void;
  onImported: () => Promise<void> | void;
}

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.csv') || name.endsWith('.xlsx');
}

export default function ImportSpicaModal({ onClose, onImported }: ImportSpicaModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SpicaImportResponse | null>(null);

  const pickFile = useCallback((next: File | null) => {
    setPreview(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!isAcceptedFile(next)) {
      toast.error('Envie Rel_Produtos.csv ou .xlsx exportado do Spica');
      return;
    }
    setFile(next);
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    pickFile(f);
  };

  const runImport = async (dryRun: boolean) => {
    if (!file) {
      toast.error('Selecione o arquivo Spica');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('dryRun', dryRun ? 'true' : 'false');
      if (!dryRun) {
        if (!preview?.checksum) {
          toast.error('Execute a simulacao antes de confirmar');
          setBusy(false);
          return;
        }
        form.set('confirmChecksum', preview.checksum);
      }

      const res = await fetch('/api/products/import-spica', { method: 'POST', body: form });
      const data = (await res.json()) as SpicaImportResponse;
      if (!res.ok) {
        throw new Error(data.error || 'Falha na importacao Spica');
      }

      if (dryRun) {
        setPreview(data);
        toast.success(`Simulacao: ${formatInt(data.summary.updatedExisting)} atualizar · ${formatInt(data.summary.inserted)} criar`);
      } else {
        toast.success(
          `Importacao Spica concluida: ${formatInt(data.summary.updatedExisting)} atualizados, ${formatInt(data.summary.inserted)} criados`,
          { duration: 10000 },
        );
        setPreview(null);
        setFile(null);
        await onImported();
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro na importacao Spica');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Importar Spica"
      subtitle="Simule o Rel_Produtos e confirme a gravacao no cadastro"
      surface="card"
      width="sm:max-w-lg"
      bodyClassName="p-0"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            Cancelar
          </button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!file || busy}
              onClick={() => void runImport(true)}
              icon={busy && !preview ? undefined : 'science'}
            >
              {busy && !preview ? <><Spinner size="sm" />Simulando...</> : 'Simular'}
            </Button>
            <Button
              type="button"
              disabled={!preview || busy}
              onClick={() => void runImport(false)}
              icon={busy && preview ? undefined : 'upload'}
            >
              {busy && preview ? <><Spinner size="sm" />Importando...</> : 'Confirmar importacao'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="px-4 sm:px-6 py-5 space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30'
          }`}
        >
          <span className="material-symbols-outlined text-[32px] text-slate-500 dark:text-slate-400">upload_file</span>
          <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Arraste Rel_Produtos.csv ou .xlsx
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Export oficial do Spica — dry-run antes de gravar
          </p>
          <div className="mt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              Selecionar arquivo
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {file && (
            <p className="mt-3 text-xs font-mono text-slate-600 dark:text-slate-300 truncate" title={file.name}>
              {file.name} · {formatInt(Math.round(file.size / 1024))} KB
            </p>
          )}
        </div>

        {preview && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Resumo da simulacao</p>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
              {[
                { label: 'Linhas Spica', value: preview.summary.totalRows },
                { label: 'Atualizar existentes', value: preview.summary.updatedExisting },
                { label: 'Criar novos', value: preview.summary.inserted },
                { label: 'Avisos', value: preview.summary.warningsCount },
                { label: 'Refs duplicadas', value: preview.summary.quarantinedDuplicates },
              ].map((item) => (
                <div key={item.label} className="bg-white dark:bg-slate-900 px-4 py-3">
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.label}</dt>
                  <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatInt(item.value)}
                  </dd>
                </div>
              ))}
            </dl>
            {preview.samples && preview.samples.length > 0 && (
              <div className="px-4 py-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Amostra</p>
                <ul className="space-y-1.5">
                  {preview.samples.slice(0, 8).map((s, i) => (
                    <li key={`${s.productKey}-${i}`} className="text-xs text-slate-600 dark:text-slate-300 font-mono truncate">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">[{s.action}]</span>{' '}
                      {s.codigo} · {s.ref}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
