'use client';

import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';

/**
 * Rótulo, controle, dica e erro num componente só.
 *
 * O rótulo era remontado à mão em 35 lugares, sempre como `<label>` solto sem
 * `htmlFor` — clicar no rótulo não focava o campo. Aqui o `id` é gerado e
 * amarrado ao controle; a dica e o erro entram por `aria-describedby` e o erro
 * marca `aria-invalid`.
 */
type FieldProps = {
  label: string;
  /** O `<input>`, `<select>` ou `<textarea>`; recebe id e aria automaticamente. */
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
};

export const FIELD_CONTROL_CLS =
  'block w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm transition-colors';

export default function Field({ label, children, hint, error, required, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as Record<string, unknown>).id ?? id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })
    : children;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label
        htmlFor={id}
        className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
      >
        {label}
        {required ? <span className="ml-1 text-red-600 dark:text-red-400">*</span> : null}
      </label>
      {control}
      {error ? (
        <span id={errorId} className="flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
            error
          </span>
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
