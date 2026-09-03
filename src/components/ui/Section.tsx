'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import Card from '@/components/ui/Card';
import CardDetailPopupModal from '@/components/ui/CardDetailPopupModal';

/**
 * Cartão de seção: chip de ícone, título, corpo — e, quando pedido, recolhível.
 *
 * Substitui quatro implementações que faziam isto com três cópias do mapa de
 * cor do chip: `SectionBlock` (37 sítios), `CollapsibleCard` (10), `SectionCard`
 * (6) e `DetailSectionCard` (4). Duas eram recolhíveis sem `aria-expanded`.
 *
 * Recolhível controlado (`open` + `onToggle`) ou não (`defaultOpen`); sem
 * nenhum dos dois, é um cartão fixo com cabeçalho estático.
 */
export type SectionTone =
  | 'primary' | 'indigo' | 'teal' | 'amber' | 'emerald' | 'violet' | 'rose' | 'orange' | 'purple' | 'blue';

const TONE: Record<SectionTone, { chip: string; icon: string }> = {
  primary: { chip: 'bg-primary/10 dark:bg-primary/20 ring-primary/20 dark:ring-primary/30', icon: 'text-primary dark:text-blue-400' },
  indigo: { chip: 'bg-indigo-500/10 dark:bg-indigo-500/20 ring-indigo-500/20 dark:ring-indigo-500/30', icon: 'text-indigo-500' },
  teal: { chip: 'bg-teal-500/10 dark:bg-teal-500/20 ring-teal-500/20 dark:ring-teal-500/30', icon: 'text-teal-500' },
  amber: { chip: 'bg-amber-500/10 dark:bg-amber-500/20 ring-amber-500/20 dark:ring-amber-500/30', icon: 'text-amber-500' },
  emerald: { chip: 'bg-emerald-500/10 dark:bg-emerald-500/20 ring-emerald-500/20 dark:ring-emerald-500/30', icon: 'text-emerald-500' },
  violet: { chip: 'bg-violet-500/10 dark:bg-violet-500/20 ring-violet-500/20 dark:ring-violet-500/30', icon: 'text-violet-500' },
  rose: { chip: 'bg-rose-500/10 dark:bg-rose-500/20 ring-rose-500/20 dark:ring-rose-500/30', icon: 'text-rose-500' },
  orange: { chip: 'bg-orange-500/10 dark:bg-orange-500/20 ring-orange-500/20 dark:ring-orange-500/30', icon: 'text-orange-500' },
  purple: { chip: 'bg-purple-500/10 dark:bg-purple-500/20 ring-purple-500/20 dark:ring-purple-500/30', icon: 'text-purple-500' },
  blue: { chip: 'bg-blue-500/10 dark:bg-blue-500/20 ring-blue-500/20 dark:ring-blue-500/30', icon: 'text-blue-500' },
};

/** Classe do ícone por tom — para quem pinta um glifo solto com o mesmo tom da seção. */
export const SECTION_ICON_CLASS: Record<SectionTone, string> = Object.fromEntries(
  Object.entries(TONE).map(([k, v]) => [k, v.icon]),
) as Record<SectionTone, string>;

type SectionProps = {
  icon: string;
  title: string;
  subtitle?: string;
  tone?: SectionTone;
  /** Ao lado do título — normalmente um `<Badge>`. */
  badge?: ReactNode;
  /** `danger` pinta título e ícone de vermelho (zona de perigo). */
  variant?: 'normal' | 'danger';
  /** Recolhível controlado. */
  open?: boolean;
  onToggle?: () => void;
  /** Recolhível não controlado. */
  defaultOpen?: boolean;
  /** Modo de visualização: 'popup' (abre em popup ao clicar) ou 'expand' (sanfona inline). */
  viewMode?: 'popup' | 'expand';
  /** Callback acionado ao clicar quando em modo popup. Se omitido, o próprio Section gere o popup. */
  onOpenPopup?: () => void;
  /** Ações no rodapé do popup (ex: botão Salvar). */
  footerActions?: ReactNode;
  /** Largura do modal em modo popup (por omissão sm:max-w-4xl). */
  popupWidth?: string;
  /** Vai para `data-section-id` — ancoragem/rolagem por seção. */
  id?: string;
  className?: string;
  children: ReactNode;
};

export default function Section({
  icon, title, subtitle, tone = 'primary', badge, variant = 'normal',
  open, onToggle, defaultOpen, viewMode = 'expand', onOpenPopup,
  footerActions, popupWidth = 'sm:max-w-4xl', id, className, children,
}: SectionProps) {
  const bodyId = useId();
  const [interno, setInterno] = useState(defaultOpen ?? false);
  const [popupInterno, setPopupInterno] = useState(false);
  const isPopupMode = viewMode === 'popup';
  const recolhivel = onToggle !== undefined || defaultOpen !== undefined || isPopupMode;
  const aberto = isPopupMode ? false : recolhivel ? (open ?? interno) : true;
  // Depois da primeira abertura o corpo fica montado e só se esconde: fechar
  // e reabrir não pode apagar o que o utilizador escreveu ou ordenou lá dentro
  // (a Tabela de Preço guarda busca e ordenação em estado local).
  const [jaAbriu, setJaAbriu] = useState(aberto);
  if (aberto && !jaAbriu) setJaAbriu(true);
  const alternar = onToggle ?? (() => setInterno((v) => !v));
  const perigo = variant === 'danger';
  const t = TONE[tone];

  const handleClick = () => {
    if (isPopupMode) {
      if (onOpenPopup) {
        onOpenPopup();
      } else {
        setPopupInterno(true);
      }
      return;
    }
    alternar();
  };

  const cabecalho = (
    <>
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${perigo ? 'bg-red-500/10 dark:bg-red-500/20 ring-red-500/20 dark:ring-red-500/30' : t.chip}`}>
        <span aria-hidden="true" className={`material-symbols-outlined text-[15px] ${perigo ? 'text-red-600 dark:text-red-400' : t.icon}`}>{icon}</span>
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="flex items-center gap-2">
          <span className={`text-sm font-bold ${perigo ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>{title}</span>
          {badge}
        </span>
        {subtitle ? <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</span> : null}
      </span>
    </>
  );

  return (
    <>
      <Card padding="none" className={`${perigo ? 'border-red-200 dark:border-red-900/50' : ''} ${className ?? ''}`} {...(id ? { 'data-section-id': id } : {})}>
        {recolhivel ? (
          // O botão dentro do <h3>: navegação por cabeçalhos continua a achar a
          // seção, e o botão continua a ser o alvo de Enter/Espaço.
          <h3 className="m-0">
            <button
              type="button"
              onClick={handleClick}
              {...(isPopupMode ? {} : { 'aria-expanded': aberto, 'aria-controls': bodyId })}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
            >
              {cabecalho}
              {isPopupMode ? (
                <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-slate-500 dark:text-slate-400" title="Abrir em popup">open_in_new</span>
              ) : (
                <span aria-hidden="true" className={`material-symbols-outlined text-[18px] text-slate-500 dark:text-slate-400 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}>expand_more</span>
              )}
            </button>
          </h3>
        ) : (
          <h3 className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800/60 m-0">{cabecalho}</h3>
        )}
        {jaAbriu && !isPopupMode ? (
          <div id={bodyId} hidden={!aberto} className={`p-4 ${recolhivel ? 'border-t border-slate-100 dark:border-slate-800/60' : ''}`}>{children}</div>
        ) : null}
      </Card>

      {isPopupMode && !onOpenPopup ? (
        <CardDetailPopupModal
          isOpen={popupInterno}
          onClose={() => setPopupInterno(false)}
          title={title}
          subtitle={subtitle}
          icon={icon}
          iconColor={perigo ? 'text-red-600 dark:text-red-400' : t.icon}
          badge={badge}
          footerActions={footerActions}
          width={popupWidth}
        >
          {children}
        </CardDetailPopupModal>
      ) : null}
    </>
  );
}
