'use client';

import { useEffect, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { readFieldInputClass } from '@/components/gestao/ReadFieldEditor';

export type ImpcgItemDraft = {
  anvisaCode: string;
  description: string;
  brand: string;
  reference: string;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
};

type Item = {
  anvisaCode: string | null;
  description: string;
  brand: string | null;
  reference: string | null;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
};

type Props = {
  items: Item[];
  canEdit?: boolean;
  edited?: boolean;
  saving?: boolean;
  formatBrl: (value: string) => string;
  onSave: (items: ImpcgItemDraft[]) => void;
  totalAmount: string;
  totalEdited?: boolean;
  onSaveTotal: (totalAmount: string) => void;
};

function toDraft(item: Item): ImpcgItemDraft {
  return {
    anvisaCode: item.anvisaCode ?? '',
    description: item.description,
    brand: item.brand ?? '',
    reference: item.reference ?? '',
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    lineTotal: item.lineTotal,
  };
}

const emptyRow = (): ImpcgItemDraft => ({
  anvisaCode: '',
  description: '',
  brand: '',
  reference: '',
  quantity: '1',
  unitAmount: '0.00',
  lineTotal: '0.00',
});

export default function ImpcgItemsEditor({
  items,
  canEdit,
  edited,
  saving,
  formatBrl,
  onSave,
  totalAmount,
  totalEdited,
  onSaveTotal,
}: Props) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<ImpcgItemDraft[]>(items.map(toDraft));
  const [totalDraft, setTotalDraft] = useState(totalAmount);

  useEffect(() => {
    if (!open) setDrafts(items.map(toDraft));
  }, [items, open]);

  useEffect(() => {
    setTotalDraft(totalAmount);
  }, [totalAmount]);

  function updateRow(index: number, patch: Partial<ImpcgItemDraft>) {
    setDrafts((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Itens aprovados</p>
        {edited ? (
          <span className="normal-case font-medium tracking-normal text-xs text-slate-500 dark:text-slate-400/80">
            editado
          </span>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center p-0 rounded text-slate-300/60 hover:text-slate-500"
            aria-label="Editar itens"
            title="Editar itens"
          >
            <span className="material-symbols-outlined leading-none" style={{ fontSize: 11, width: 11, height: 11 }}>
              edit
            </span>
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Itens aprovados</caption>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 font-bold">
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Marca</th>
              <th className="px-3 py-2">Ref.</th>
              <th className="px-3 py-2 text-right">Qtd</th>
              <th className="px-3 py-2 text-right">Unitário</th>
              <th className="px-3 py-2 text-right">Total</th>
              {open && canEdit ? <th className="px-2 py-2 w-8"><span className="sr-only">Remover</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {open && canEdit ? (
              drafts.length === 0 ? (
                <tr>
                  <td colSpan={7}><EmptyState compact icon="inbox" title="Nenhum item. Adicione uma linha." /></td>
                </tr>
              ) : (
                drafts.map((item, index) => (
                  <tr key={`draft-${index}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1">
                      <input
                        value={item.description}
                        onChange={(event) => updateRow(index, { description: event.target.value })}
                        className={readFieldInputClass}
                        aria-label={`Descrição ${index + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={item.brand}
                        onChange={(event) => updateRow(index, { brand: event.target.value })}
                        className={readFieldInputClass}
                        aria-label={`Marca ${index + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={item.reference}
                        onChange={(event) => updateRow(index, { reference: event.target.value })}
                        className={readFieldInputClass}
                        aria-label={`Referência ${index + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={item.quantity}
                        onChange={(event) => updateRow(index, { quantity: event.target.value })}
                        className={`${readFieldInputClass} text-right font-mono w-16`}
                        aria-label={`Quantidade ${index + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={item.unitAmount}
                        onChange={(event) => updateRow(index, { unitAmount: event.target.value })}
                        className={`${readFieldInputClass} text-right font-mono w-24`}
                        aria-label={`Unitário ${index + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={item.lineTotal}
                        onChange={(event) => updateRow(index, { lineTotal: event.target.value })}
                        className={`${readFieldInputClass} text-right font-mono w-24`}
                        aria-label={`Total da linha ${index + 1}`}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600"
                        aria-label={`Remover item ${index + 1}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              )
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6}><EmptyState compact icon="inbox" title="Nenhum item extraído." /></td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={`${item.description}-${index}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">{item.description}</td>
                  <td className="px-3 py-2">{item.brand || '—'}</td>
                  <td className="px-3 py-2">{item.reference || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{item.quantity}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatBrl(item.unitAmount)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{formatBrl(item.lineTotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDrafts((current) => [...current, emptyRow()])}
            className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-400"
          >
            Adicionar item
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              onSave(drafts.filter((row) => row.description.trim()));
              setOpen(false);
            }}
            className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 disabled:opacity-50"
          >
            ok
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Total do ofício
          {totalEdited ? (
            <span className="ml-1 normal-case font-medium tracking-normal text-xs text-slate-500 dark:text-slate-400/80">
              editado
            </span>
          ) : null}
        </span>
        {canEdit ? (
          <>
            <input
              value={totalDraft}
              onChange={(event) => setTotalDraft(event.target.value)}
              className={`${readFieldInputClass} font-mono w-36 text-right`}
              placeholder="12.550,00"
              aria-label="Total do ofício"
            />
            <button
              type="button"
              disabled={saving || !totalDraft.trim()}
              onClick={() => onSaveTotal(totalDraft.trim())}
              className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 disabled:opacity-50"
            >
              Salvar total
            </button>
          </>
        ) : (
          <span className="font-mono font-bold">{formatBrl(totalAmount)}</span>
        )}
      </div>
    </div>
  );
}
