'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import { kindConfig } from '@/lib/documentos/families';
import type { DocumentosRow } from '@/lib/documentos/list';
import { formatDocumentDate } from '@/lib/utils';
import { formatDaysRemaining, isDaysDestaque } from './DocumentosFamilyTable';

export type DocumentoDetalhePatch = {
  validUntil?: string;
  emitidoEm?: string | null;
  manufacturer?: string | null;
};

export type DocumentoDetalheModalProps = {
  isOpen: boolean;
  onClose: () => void;
  row: DocumentosRow | null;
  canWrite: boolean;
  onView: (row: DocumentosRow) => void;
  onShare: (row: DocumentosRow) => void;
  onWhatsApp: (row: DocumentosRow) => void;
  onUpdate: (row: DocumentosRow) => void;
  /** Persiste PATCH e devolve a linha atualizada (ou null se falhou). */
  onPatch: (row: DocumentosRow, patch: DocumentoDetalhePatch) => Promise<DocumentosRow | null>;
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

function emitidoEmLabel(row: DocumentosRow): string {
  return row.category === 'carta' ? 'Assinatura' : 'Emitido em';
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

const PENCIL_CLS =
  'inline-flex items-center justify-center rounded p-0.5 text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/10 transition-colors';

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

function PencilButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={PENCIL_CLS} title={label} aria-label={label} onClick={onClick}>
      <span className="material-symbols-outlined text-[12px] leading-none" aria-hidden="true">
        edit
      </span>
    </button>
  );
}

type EditKind = 'emitidoEm' | 'validUntil' | 'manufacturer' | null;

export default function DocumentoDetalheModal({
  isOpen,
  onClose,
  row,
  canWrite,
  onView,
  onShare,
  onWhatsApp,
  onUpdate,
  onPatch,
}: DocumentoDetalheModalProps) {
  const [editing, setEditing] = useState<EditKind>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setEditing(null);
      setDraft('');
      setSaving(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setEditing(null);
    setDraft('');
  }, [row?.id]);

  if (!row) return null;

  const current = row;
  const config = kindConfig(current.kind);
  const destaque = isDaysDestaque(current.daysRemaining);
  const hasFile = Boolean(current.id && current.fileName);
  const canUpdate = canWrite && current.category === 'certidao';
  const canEditDates = canWrite && Boolean(current.id) && current.expira !== false;
  const canEditManufacturer = canWrite && Boolean(current.id) && current.category === 'carta';

  function startEdit(kind: Exclude<EditKind, null>) {
    setEditing(kind);
    if (kind === 'emitidoEm') setDraft(current.emitidoEm ?? '');
    else if (kind === 'validUntil') setDraft(current.validUntil ?? '');
    else setDraft(current.manufacturer?.trim() || current.label);
  }

  async function saveEdit() {
    if (!current.id || !editing) return;
    if (editing !== 'manufacturer' && !draft) return;
    setSaving(true);
    try {
      const patch: DocumentoDetalhePatch =
        editing === 'emitidoEm'
          ? { emitidoEm: draft || null }
          : editing === 'validUntil'
            ? { validUntil: draft }
            : { manufacturer: draft.trim() || null };
      const updated = await onPatch(current, patch);
      if (updated) {
        setEditing(null);
        setDraft('');
      }
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  function DateOrTextEditor({
    kind,
    label,
    display,
    inputType,
  }: {
    kind: Exclude<EditKind, null>;
    label: string;
    display: ReactNode;
    inputType: 'date' | 'text';
  }) {
    if (editing === kind) {
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <input
            type={inputType}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={label}
            className={`${FIELD_CONTROL_CLS} max-w-52`}
            autoFocus
          />
          <Button size="xs" onClick={() => void saveEdit()} loading={saving} disabled={kind !== 'manufacturer' && !draft}>
            Salvar
          </Button>
          <Button size="xs" variant="ghost" onClick={cancelEdit} disabled={saving}>
            Cancelar
          </Button>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1">
        {display}
        {canWrite && current.id && (kind === 'manufacturer' ? canEditManufacturer : canEditDates) ? (
          <PencilButton label={`Editar ${label.toLowerCase()}`} onClick={() => startEdit(kind)} />
        ) : null}
      </span>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Gestão: ${current.label}`}
      width="sm:max-w-lg"
      footer={null}
    >
      <dl className="flex flex-col gap-3">
        {current.category === 'carta' ? (
          <Field label="Fabricante">
            <DateOrTextEditor
              kind="manufacturer"
              label="Fabricante"
              inputType="text"
              display={<span>{current.manufacturer?.trim() || current.label}</span>}
            />
          </Field>
        ) : (
          <Field label="Tipo">{current.label}</Field>
        )}
        <Field label="Arquivo">{current.fileName ?? 'sem arquivo'}</Field>
        <Field label={emitidoEmLabel(current)}>
          <DateOrTextEditor
            kind="emitidoEm"
            label={emitidoEmLabel(current)}
            inputType="date"
            display={<span>{emitidoEmTexto(current)}</span>}
          />
        </Field>
        <Field label="Vence em">
          {current.expira === false ? (
            'não vence'
          ) : (
            <DateOrTextEditor
              kind="validUntil"
              label="Validade"
              inputType="date"
              display={<span>{venceEmTexto(current)}</span>}
            />
          )}
        </Field>
        <Field label="Dias restantes">
          <span
            className={`tabular-nums ${
              destaque
                ? 'font-medium text-amber-700 dark:text-amber-400'
                : 'text-slate-900 dark:text-white'
            }`}
            data-destaque={destaque ? 'true' : undefined}
          >
            {diasTexto(current)}
          </span>
        </Field>
        <Field label="O que é este documento">{config?.descricao ?? '—'}</Field>
        <div data-bloco="quem-emite">
          <dt className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Quem emite / onde renovar
          </dt>
          <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
            <p>{config?.orgao ?? 'não informado'}</p>
            {current.emissaoUrl ? (
              <a
                href={current.emissaoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary-dark dark:text-blue-400 hover:underline"
              >
                {current.emissaoAria ?? `Emitir ${current.label}`}
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
              </a>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {hasFile && current.id ? (
          <Button
            type="button"
            variant="secondary"
            icon="receipt_long"
            onClick={() => onView(current)}
            block
            className="sm:w-auto"
          >
            Ver
          </Button>
        ) : null}
        {hasFile && current.id && current.fileName ? (
          <Button
            type="button"
            variant="secondary"
            icon="download"
            onClick={() => downloadArquivo(current.id!, current.fileName!)}
            block
            className="sm:w-auto"
          >
            Baixar
          </Button>
        ) : null}
        {canWrite && hasFile && current.id ? (
          <Button
            type="button"
            variant="secondary"
            icon="share"
            onClick={() => onShare(current)}
            block
            className="sm:w-auto"
          >
            Compartilhar
          </Button>
        ) : null}
        {canWrite && hasFile && current.id ? (
          <Button
            type="button"
            variant="secondary"
            icon="chat"
            onClick={() => onWhatsApp(current)}
            block
            className="sm:w-auto"
          >
            WhatsApp
          </Button>
        ) : null}
        {canUpdate ? (
          <Button
            type="button"
            variant="secondary"
            icon="upload_file"
            onClick={() => onUpdate(current)}
            block
            className="sm:w-auto"
          >
            Atualizar arquivo
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
