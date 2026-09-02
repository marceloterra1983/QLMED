import type { ElementType, HTMLAttributes, ReactNode } from 'react';

/**
 * Cartão de superfície. Havia 60 escritas de `bg-white dark:bg-card-dark
 * border … rounded-xl` em 26 ficheiros, com dez paddings e sombra em 22 delas.
 *
 * Em repouso não tem sombra — a borda basta; sombra é para o que flutua
 * (modal, menu suspenso). `padding="none"` para quem gere o próprio corpo
 * (tabela, lista com divisores).
 */
type CardProps = {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** `section`, `article`, `li`… por defeito `div`. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>;

const PADDING = { none: '', sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-6' } as const;

export default function Card({ padding = 'md', as: Tag = 'div', className, children, ...rest }: CardProps) {
  return (
    <Tag {...rest} className={`bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden ${PADDING[padding]} ${className ?? ''}`}>
      {children}
    </Tag>
  );
}
