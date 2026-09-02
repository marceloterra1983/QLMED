/**
 * Indicador de carregamento. Havia 25 `animate-spin` à mão em 19 ficheiros,
 * em nove tamanhos. `<Button loading>` já cobre o caso do botão; este é para
 * bloco, célula e página.
 *
 * `role="status"` com rótulo: o leitor de tela ouve "Carregando" em vez de
 * silêncio; `aria-live` fica por conta de quem o mostra/esconde.
 */
type SpinnerProps = {
  size?: 'sm' | 'md' | 'lg';
  /** Texto para o leitor de tela; por defeito "Carregando". */
  label?: string;
  className?: string;
};

const SIZE = { sm: 'text-[16px]', md: 'text-[24px]', lg: 'text-[32px]' } as const;

export default function Spinner({ size = 'md', label = 'Carregando', className }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={`inline-flex items-center justify-center ${className ?? ''}`}>
      <span aria-hidden="true" className={`material-symbols-outlined animate-spin text-slate-500 dark:text-slate-400 ${SIZE[size]}`}>
        progress_activity
      </span>
    </span>
  );
}
