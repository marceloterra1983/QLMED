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

// O nome do glifo vai junto com o tamanho: é tamanho de ícone, e a regra `scale`
// só isenta px cru em literal que diga `material-symbols`.
const SIZE = { sm: 'material-symbols-outlined text-[16px]', md: 'material-symbols-outlined text-[24px]', lg: 'material-symbols-outlined text-[32px]' } as const;

export default function Spinner({ size = 'md', label = 'Carregando', className }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={`inline-flex items-center justify-center ${className ?? ''}`}>
      <span aria-hidden="true" className={`animate-spin text-slate-500 dark:text-slate-400 ${SIZE[size]}`}>
        progress_activity
      </span>
    </span>
  );
}
