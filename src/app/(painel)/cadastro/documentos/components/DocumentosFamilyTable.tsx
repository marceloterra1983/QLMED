'use client';

import type { KeyboardEvent, SyntheticEvent } from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { FIELD_CONTROL_CLS } from '@/components/ui/Field';
import { RowActionsBase, type RowAction } from '@/components/ui/RowActions';
import { formatDocumentDate, formatInt } from '@/lib/utils';
import type { DocumentosAutomacao } from '@/lib/documentos/families';
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

const CELL = 'px-3 py-2 sm:py-1.5';

const INLINE_ICON_BTN =
  'p-1.5 rounded-lg text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/10 transition-colors';

/**
 * Só o que é automático ganha etiqueta. `manual` é o caso comum e não merece
 * ruído; `assistida` também fica sem etiqueta por enquanto — decisão do dono,
 * que pediu apenas AUTO ao lado dos dias restantes.
 */
const AUTOMACAO_TAG: Partial<Record<DocumentosAutomacao, string>> = {
  automatica: 'AUTO',
};

function arquivoUrl(id: string, download = false): string {
  return download ? `/api/documentos/${id}/arquivo?download=1` : `/api/documentos/${id}/arquivo`;
}

function stopRowEvent(event: SyntheticEvent) {
  event.stopPropagation();
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
    <span className="inline-flex items-center whitespace-nowrap">
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
      <AutomacaoTag value={row.automacao} />
    </span>
  );
}

function AutomacaoTag({ value }: { value: DocumentosAutomacao | null }) {
  const texto = value ? AUTOMACAO_TAG[value] : undefined;
  if (!texto) return null;
  return (
    <Badge
      tone="success"
      dot={false}
      className="ml-2 uppercase tracking-wide"
      title="Emissão automatizável neste portal"
    >
      {texto}
    </Badge>
  );
}

function downloadArquivo(id: string, fileName: string) {
  const link = document.createElement('a');
  link.href = arquivoUrl(id, true);
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  link.click();
}

function printArquivo(id: string) {
  window.open(arquivoUrl(id), '_blank', 'noopener,noreferrer');
}

function openFolder(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
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
  onOpenDetail: (row: DocumentosRow) => void;
  onUpdate: (row: DocumentosRow) => void;
  onShare: (row: DocumentosRow) => void;
  layout?: 'validity' | 'yearFolders';
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
  onOpenDetail,
  onUpdate,
  onShare,
  layout = 'validity',
}: DocumentosFamilyTableProps) {
  function isEditingRow(row: DocumentosRow): boolean {
    return canWrite && row.id !== null && editingId === row.id;
  }

  function canUpdateRow(row: DocumentosRow): boolean {
    return canWrite && layout !== 'yearFolders' && row.category === 'certidao';
  }

  function rowActivateLabel(row: DocumentosRow): string | null {
    if (layout === 'yearFolders') {
      return row.webUrl ? `Abrir pasta ${row.label} no OneDrive` : null;
    }
    if (isEditingRow(row)) return null;
    return `Abrir gestão de ${row.label}`;
  }

  function activateRow(row: DocumentosRow) {
    if (layout === 'yearFolders') {
      if (row.webUrl) openFolder(row.webUrl);
      return;
    }
    if (isEditingRow(row)) return;
    onOpenDetail(row);
  }

  function rowActions(row: DocumentosRow) {
    if (layout === 'yearFolders') {
      if (!row.webUrl) return null;
      return (
        <a
          href={row.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={INLINE_ICON_BTN}
          title="Abrir pasta no OneDrive"
          aria-label="Abrir pasta no OneDrive"
        >
          <span className="material-symbols-outlined text-[18px]">folder_open</span>
        </a>
      );
    }

    const hasFile = Boolean(row.id && row.fileName);
    const inline: RowAction[] = [];
    const menu: RowAction[] = [];

    if (hasFile && row.id && row.fileName) {
      inline.push({ label: 'Ver documento', icon: 'receipt_long', onSelect: () => onView(row) });
      inline.push({
        label: 'Imprimir',
        icon: 'print',
        onSelect: () => printArquivo(row.id!),
        hideOnMobile: true,
      });
      if (canWrite) {
        menu.push({ label: 'Compartilhar', icon: 'share', onSelect: () => onShare(row) });
      }
      menu.push({
        label: 'Baixar',
        icon: 'download',
        onSelect: () => downloadArquivo(row.id!, row.fileName!),
      });
    }

    if (canUpdateRow(row)) {
      menu.push({ label: 'Atualizar arquivo', icon: 'upload_file', onSelect: () => onUpdate(row) });
    }
    if (canWrite && row.id && row.expira !== false) {
      menu.push({ label: 'Editar validade', icon: 'edit', onSelect: () => onStartEdit(row) });
    }

    const actions =
      inline.length === 0 && menu.length === 0 ? null : menu.length === 0 ? (
        <div className="flex items-center justify-center gap-0">
          {inline.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onSelect}
              className={`${action.hideOnMobile ? 'hidden sm:flex ' : ''}${INLINE_ICON_BTN}`}
              title={action.label}
              aria-label={action.label}
            >
              <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
            </button>
          ))}
        </div>
      ) : (
        <RowActionsBase inline={inline} menu={menu} />
      );

    const emissao = row.emissaoUrl ? (
      <a
        href={row.emissaoUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={row.emissaoAria ?? `Emitir ${row.label}`}
        aria-label={row.emissaoAria ?? `Emitir ${row.label}`}
        className={INLINE_ICON_BTN}
        onClick={stopRowEvent}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">open_in_new</span>
      </a>
    ) : null;

    return (
      /**
       * `whitespace-nowrap` de propósito: com `flex-wrap` o link de emissão,
       * por ser o último filho, era empurrado para uma segunda linha e sumia da
       * vista em ecrãs estreitos. Ele é a ação mais usada da tabela — é por ele
       * que se vai emitir a certidão nova.
       */
      <div className="flex items-center justify-center gap-0 whitespace-nowrap">
        {emissao}
        {actions}
        {isEditingRow(row) ? (
          <>
            <Button size="xs" onClick={() => onSaveEdit()} loading={saving} disabled={!editDraft}>
              Salvar
            </Button>
            <Button size="xs" variant="ghost" onClick={onCancelEdit} disabled={saving}>
              Cancelar
            </Button>
          </>
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
            <th className={CELL}>{columnLabel}</th>
            {layout === 'yearFolders' ? null : (
              <>
                <th className={CELL}>Válida até</th>
                <th className={CELL}>Dias restantes</th>
              </>
            )}
            <th className={CELL}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.id ?? `${row.category}:${row.kind}`;
            const activateLabel = rowActivateLabel(row);
            const clickable = activateLabel != null;
            return (
              <tr
                key={key}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={activateLabel ?? undefined}
                onClick={clickable ? () => activateRow(row) : undefined}
                onKeyDown={
                  clickable
                    ? (event: KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          activateRow(row);
                        }
                      }
                    : undefined
                }
                className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                  clickable ? 'cursor-pointer' : ''
                }`}
              >
                <td className={CELL}>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{row.label}</span>
                </td>
                {layout === 'yearFolders' ? null : (
                  <>
                    <td
                      className={`${CELL} text-sm whitespace-nowrap`}
                      onClick={stopRowEvent}
                      onKeyDown={stopRowEvent}
                    >
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
                        </span>
                      )}
                    </td>
                    <td className={CELL}>
                      <DaysCell row={row} />
                    </td>
                  </>
                )}
                <td
                  className={`${CELL} whitespace-nowrap`}
                  onClick={stopRowEvent}
                  onKeyDown={stopRowEvent}
                >
                  {rowActions(row)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
