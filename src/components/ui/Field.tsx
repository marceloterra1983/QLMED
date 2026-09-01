'use client';

import { Children, cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Rótulo, controle, dica e erro num componente só.
 *
 * O rótulo era remontado à mão em 35 lugares, sempre como `<label>` solto sem
 * `htmlFor` — clicar no rótulo não focava o campo.
 *
 * A amarração aqui é **implícita**: o `<label>` envolve o controle. Isso vale a
 * qualquer profundidade, e é o que salva o caso real de um `<input>` embrulhado
 * num `<div className="relative">` por causa do ícone de busca — com `htmlFor` o
 * id acabaria no `<div>`, que não é elemento rotulável, e a amarração morreria
 * calada. Dica e erro entram por `aria-describedby` no primeiro controle que a
 * árvore contiver.
 */
type FieldProps = {
  label: ReactNode;
  /** O controle, sozinho ou embrulhado. */
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
};

export const FIELD_CONTROL_CLS =
  'block w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm transition-colors';

const CONTROLES = new Set(['input', 'select', 'textarea']);

/** Marca o primeiro controle da árvore com os atributos de acessibilidade. */
function marcarControle(node: ReactNode, aria: Record<string, unknown>, feito: { ok: boolean }): ReactNode {
  if (feito.ok || !isValidElement(node)) return node;
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === 'string' && CONTROLES.has(el.type)) {
    feito.ok = true;
    return cloneElement(el as ReactElement<Record<string, unknown>>, aria);
  }
  const filhos = (el.props as { children?: ReactNode }).children;
  if (filhos == null) return el;
  return cloneElement(el, {
    children: Children.map(filhos, (f) => marcarControle(f, aria, feito)),
  });
}

export default function Field({ label, children, hint, error, required, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  const aria: Record<string, unknown> = {};
  if (describedBy) aria['aria-describedby'] = describedBy;
  if (error) aria['aria-invalid'] = true;
  if (required) aria['aria-required'] = true;

  const feito = { ok: false };
  const conteudo = Object.keys(aria).length
    ? Children.map(children, (f) => marcarControle(f, aria, feito))
    : children;

  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
        {required ? <span className="ml-1 text-red-600 dark:text-red-400">*</span> : null}
      </span>
      {conteudo}
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
    </label>
  );
}
