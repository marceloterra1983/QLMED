'use client';

import { useState, type ReactNode } from 'react';

type Props = {
  label: string;
  display: ReactNode;
  edited?: boolean;
  canEdit?: boolean;
  saving?: boolean;
  children: ReactNode;
  onSave: () => void;
};

export default function ReadFieldEditor({
  label,
  display,
  edited,
  canEdit,
  saving,
  children,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        {edited ? (
          <span className="normal-case font-medium tracking-normal text-[10px] text-slate-400/80">
            editado
          </span>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="p-0.5 rounded text-slate-300/70 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
            aria-label={`Editar ${label}`}
            title={`Editar ${label}`}
          >
            <span className="material-symbols-outlined text-[13px] leading-none">edit</span>
          </button>
        ) : null}
      </dt>
      {open && canEdit ? (
        <dd className="flex flex-wrap items-center gap-1.5 mt-1">
          {children}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              onSave();
              setOpen(false);
            }}
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary disabled:opacity-50"
          >
            ok
          </button>
        </dd>
      ) : (
        <dd>{display}</dd>
      )}
    </div>
  );
}

export const readFieldInputClass =
  'min-w-0 flex-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-sm';
