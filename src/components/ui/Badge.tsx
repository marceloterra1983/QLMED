import type { ReactNode } from 'react';

/**
 * Pill de situação. Havia 22 escritas à mão em 11 ficheiros, com cinco
 * combinações de fundo/texto/borda para dizer a mesma coisa.
 *
 * O ponto colorido vai junto com o texto de propósito: quem não distingue
 * verde de vermelho lê o rótulo, não a cor — a cor só reforça.
 */
export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<BadgeTone, { pill: string; dot: string }> = {
  success: { pill: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', dot: 'bg-green-500' },
  warning: { pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dot: 'bg-amber-500' },
  danger: { pill: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500' },
  info: { pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
  neutral: { pill: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
};

type BadgeProps = {
  tone?: BadgeTone;
  /** Sem ponto: contador ou rótulo sem estado (ex.: "3 itens"). */
  dot?: boolean;
  /** Dica ao passar o mouse — o texto continua a ser o rótulo. */
  title?: string;
  className?: string;
  children: ReactNode;
};

export default function Badge({ tone = 'neutral', dot = true, title, className, children }: BadgeProps) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${t.pill} ${className ?? ''}`}
    >
      {dot ? <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} /> : null}
      {children}
    </span>
  );
}
