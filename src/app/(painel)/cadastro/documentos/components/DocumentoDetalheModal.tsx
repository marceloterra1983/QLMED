'use client';

import type { ReactNode } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { kindConfig } from '@/lib/documentos/families';
import type { DocumentosRow } from '@/lib/documentos/list';
import { formatDocumentDate } from '@/lib/utils';
import { formatDaysRemaining, isDaysDestaque } from './DocumentosFamilyTable';

export type DocumentoDetalheModalProps = {
  isOpen: boolean;
  onClose: () => void;
  row: DocumentosRow | null;
  canWrite: boolean;
  onView: (row: DocumentosRow) => void;
  onShare: (row: DocumentosRow) => void;
  onUpdate: (row: DocumentosRow) => void;
  onStartEdit: (row: DocumentosRow) => void;
};

function arquivoUrl(id: string, download = false): string {
  return download ? `/api/documentos/${id}/arquivo?download=1` : `/api/documentos/${id}/arquivo`;
}

function downloadArquivo(id: string, fileName: string) {
  const link = document.createElement('a');
  link.href = arquivoUrl(id, true);
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  link.click();
}

/** Nunca lastModifiedAt: essa é a data do ficheiro no OneDrive, não a do documento. */
export function emitidoEmTexto(row: DocumentosRow): string {
  return row.emitidoEm ? formatDocumentDate(row.emitidoEm) : 'não informado';
}

function venceEmTexto(row: DocumentosRow): string {
  if (row.expira === false) return 'não vence';
  if (!row.validUntil) return 'Sem data';
  return formatDocumentDate(row.validUntil);
}

function diasTexto(row: DocumentosRow): string {
  if (row.expira === false) return 'não vence';
  return formatDaysRemaining(row.daysRemaining);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">{children}</dd>
    </div>
  );
}

export default function DocumentoDetalheModal({
  isOpen,
  onClose,
  row,
  canWrite,
  onView,
  onShare,
  onUpdate,
  onStartEdit,
}: DocumentoDetalheModalProps) {
  if (!row) return null;

  const config = kindConfig(row.kind);
  const destaque = isDaysDestaque(row.daysRemaining);
  const hasFile = Boolean(row.id && row.fileName);
  const canUpdate = canWrite && row.category === 'certidao';
  const canEditValidity = canWrite && Boolean(row.id) && row.expira !== false;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Gestão: ${row.label}`}
      width="sm:max-w-lg"
      footer={null}
    >
      <dl className="flex flex-col gap-3">
        <Field label="Tipo">{row.label}</Field>
        <Field label="Arquivo">{row.fileName ?? 'sem arquivo'}</Field>
        <Field label="Emitido em">{emitidoEmTexto(row)}</Field>
        <Field label="Vence em">{venceEmTexto(row)}</Field>
        <Field label="Dias restantes">
          <span
            className={`tabular-nums ${
              destaque
                ? 'font-medium text-amber-700 dark:text-amber-400'
                : 'text-slate-900 dark:text-white'
            }`}
            data-destaque={destaque ? 'true' : undefined}
          >
            {diasTexto(row)}
          </span>
        </Field>
        <Field label="O que é este documento">{config?.descricao ?? '—'}</Field>
        <div data-bloco="quem-emite">
          <dt className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Quem emite / onde renovar
          </dt>
          <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
            <p>{config?.orgao ?? 'não informado'}</p>
            {row.emissaoUrl ? (
              <a
                href={row.emissaoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary-dark dark:text-blue-400 hover:underline"
              >
                {row.emissaoAria ?? `Emitir ${row.label}`}
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
              </a>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {hasFile && row.id ? (
          <Button
            type="button"
            variant="secondary"
            icon="receipt_long"
            onClick={() => onView(row)}
            block
            className="sm:w-auto"
          >
            Ver
          </Button>
        ) : null}
        {hasFile && row.id && row.fileName ? (
          <Button
            type="button"
            variant="secondary"
            icon="download"
            onClick={() => downloadArquivo(row.id!, row.fileName!)}
            block
            className="sm:w-auto"
          >
            Baixar
          </Button>
        ) : null}
        {canWrite && hasFile && row.id ? (
          <Button
            type="button"
            variant="secondary"
            icon="share"
            onClick={() => onShare(row)}
            block
            className="sm:w-auto"
          >
            Compartilhar
          </Button>
        ) : null}
        {canUpdate ? (
          <Button
            type="button"
            variant="secondary"
            icon="upload_file"
            onClick={() => onUpdate(row)}
            block
            className="sm:w-auto"
          >
            Atualizar arquivo
          </Button>
        ) : null}
        {canEditValidity ? (
          <Button
            type="button"
            variant="secondary"
            icon="edit"
            onClick={() => onStartEdit(row)}
            block
            className="sm:w-auto"
          >
            Editar validade
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
