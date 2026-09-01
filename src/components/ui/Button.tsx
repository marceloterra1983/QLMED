import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Botão único do painel. Substitui as escritas soltas que divergiam em hover
 * (`primary-dark` / `primary/90` / `opacity-90` / nenhum), raio (`lg` / `xl`),
 * peso (`semibold` / `bold` / `extrabold`) e estado desabilitado.
 *
 * Contraste: nenhuma variante usa `text-primary`, que dá 2,91:1 sobre
 * `card-dark`. O foco vem do contorno global em `globals.css` — sem
 * `focus:ring-*` por cima.
 */
export type ButtonVariant = 'primary' | 'soft' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary hover:bg-primary-dark text-white font-bold',
  // Ação secundária de marca. `text-primary` daria 4,48:1 sobre o fundo
  // tingido — abaixo da AA; `primary-dark` dá 5,81:1.
  soft: 'bg-primary/10 hover:bg-primary/20 text-primary-dark dark:text-blue-400 font-bold',
  secondary:
    'bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold',
  ghost:
    'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-semibold',
  danger: 'bg-red-600 hover:bg-red-700 text-white font-bold',
};

/** Alturas: 44px é o piso de alvo de toque, por isso `lg` no celular. */
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 gap-1.5 text-sm',
  md: 'h-10 px-4 gap-2 text-sm',
  lg: 'h-11 px-5 gap-2 text-base',
};

/** Classe completa do glifo: px cru aqui dimensiona ícone, não texto. */
const ICON_SIZE: Record<ButtonSize, string> = {
  sm: 'material-symbols-outlined text-[16px]',
  md: 'material-symbols-outlined text-[18px]',
  lg: 'material-symbols-outlined text-[20px]',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg whitespace-nowrap transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none';

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Nome do glifo Material Symbols, à esquerda do rótulo. */
  icon?: string;
  /** Troca o ícone por um indicador girando e desabilita a ação. */
  loading?: boolean;
  /** Ocupa a largura toda — formulários e rodapé de modal no celular. */
  block?: boolean;
  /**
   * Âncora simples em vez de `<Link>`: destino fora do app, ou recarga dura
   * de propósito (as fronteiras de erro navegam assim para limpar o estado).
   */
  external?: boolean;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function classes({ variant = 'primary', size = 'md', block, className }: CommonProps) {
  return [BASE, VARIANT[variant], SIZE[size], block ? 'w-full' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
}

export default function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', icon, loading, block, external, className, children, ...rest } = props;
  const cls = classes({ variant, size, block, className });

  const glyph = loading ? 'progress_activity' : icon;
  const body = (
    <>
      {glyph ? (
        <span
          aria-hidden="true"
          className={`${ICON_SIZE[size]} ${loading ? 'animate-spin' : ''}`}
        >
          {glyph}
        </span>
      ) : null}
      {children}
    </>
  );

  if (typeof props.href === 'string') {
    const { href, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
    if (external) {
      return (
        <a href={href} className={cls} {...anchorRest}>
          {body}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} {...anchorRest}>
        {body}
      </Link>
    );
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      {...buttonRest}
      type={buttonRest.type ?? 'button'}
      disabled={buttonRest.disabled || loading}
      aria-busy={loading || undefined}
      className={cls}
    >
      {body}
    </button>
  );
}
