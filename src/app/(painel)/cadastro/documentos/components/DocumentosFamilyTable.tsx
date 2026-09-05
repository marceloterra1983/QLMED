'use client';

import Button from '@/components/ui/Button';
import { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import { formatDocumentDate, formatInt } from '@/lib/utils';
import type { DocumentosRow } from '@/lib/documentos/list';

/** Destaque de dias restantes: uma semana ou menos (inclui vence hoje e vencida). */
export const CERTIDAO_DIAS_DESTAQUE = 7;

export function formatDaysRemaining(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'vence hoje';
  if (days === 1) return '1 dia';
  if (days > 0) return `${formatInt(days)} dias`;
  const n = -days;
  if (n === 1) return 'vencida há 1 dia';
  return `vencida há ${formatInt(n)} dias`;
}

export function isDaysDestaque(days: number | null): boolean {
  return days != null && days <= CERTIDAO_DIAS_DESTAQUE;
}

const ICON_BTN =
  'inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800';

function arquivoUrl(id: string, download = false): string {
  return download ? `/api/documentos/${id}/arquivo?download=1` : `/api/documentos/${id}/arquivo`;
}

function ValidityText({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-slate-500 dark:text-slate-400">Sem data</span>;
  }
  return <span className="tabular-nums">{formatDocumentDate(value)}</span>;
}

function DaysCell({ row }: { row: DocumentosRow }) {
  if (row.id && row.expira === false) {
    return (
      <span className="tabular-nums text-sm text-slate-700 dark:text-slate-300">não vence</span>
    );
  }
  const days = row.daysRemaining;
  const destaque = isDaysDestaque(days);
  return (
    <span
      className={`tabular-nums text-sm ${
        destaque
          ? 'font-medium text-amber-700 dark:text-amber-400'
          : 'text-slate-700 dark:text-slate-300'
      }`}
      data-destaque={destaque ? 'true' : undefined}
    >
      {formatDaysRemaining(days)}
    </span>
  );
}

export type DocumentosFamilyTableProps = {
  caption: string;
  columnLabel: string;
  rows: DocumentosRow[];
  canWrite: boolean;
  editingId: string | null;
  editDraft: string;
  saving: boolean;
  onEditDraft: (value: string) => void;
  onStartEdit: (row: DocumentosRow) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onView: (row: DocumentosRow) => void;
};

export default function DocumentosFamilyTable({
  caption,
  columnLabel,
  rows,
  canWrite,
  editingId,
  editDraft,
  saving,
  onEditDraft,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onView,
}: DocumentosFamilyTableProps) {
  function isEditingRow(row: DocumentosRow): boolean {
    return canWrite && row.id !== null && editingId === row.id;
  }

  function rowActions(row: DocumentosRow) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {row.id && row.fileName ? (
          <>
            <Button
              size="xs"
              variant="ghost"
              icon="picture_as_pdf"
              onClick={() => onView(row)}
            >
              Ver
            </Button>
            <Button
              href={arquivoUrl(row.id, true)}
              external
              download={row.fileName}
              size="xs"
              variant="ghost"
              icon="download"
            >
              Baixar
            </Button>
          </>
        ) : null}
        {isEditingRow(row) ? (
          <>
            <Button size="xs" onClick={() => onSaveEdit()} loading={saving} disabled={!editDraft}>
              Salvar
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={onCancelEdit}
              disabled={saving}
            >
              Cancelar
            </Button>
          </>
        ) : null}
        {row.emissaoUrl ? (
          <a
            href={row.emissaoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={row.emissaoAria ?? `Emitir ${row.label}`}
            className={ICON_BTN}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">open_in_new</span>
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">
            <th className="px-4 py-3">{columnLabel}</th>
            <th className="px-4 py-3">Válida até</th>
            <th className="px-4 py-3">Dias restantes</th>
            <th className="px-4 py-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.id ?? `${row.category}:${row.kind}`;
            return (
              <tr
                key={key}
                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{row.label}</span>
                </td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">
                  {isEditingRow(row) ? (
                    <input
                      type="date"
                      value={editDraft}
                      onChange={(event) => onEditDraft(event.target.value)}
                      aria-label="Validade"
                      className={`${FIELD_CONTROL_CLS} max-w-40`}
                    />
                  ) : (
                    <span className="inline-flex items-center">
                      {row.id && row.expira === false ? (
                        <span className="text-slate-500 dark:text-slate-400">—</span>
                      ) : (
                        <ValidityText value={row.validUntil} />
                      )}
                      {canWrite && row.id && row.expira !== false ? (
                        <button
                          type="button"
                          className={ICON_BTN}
                          aria-label={`Editar validade de ${row.label}`}
                          onClick={() => onStartEdit(row)}
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <DaysCell row={row} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{rowActions(row)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
