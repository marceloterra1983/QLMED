import { useEffect, useRef, useCallback, useId } from 'react';
import type { ReactNode } from 'react';
import { useModalBackButton } from '@/hooks/useModalBackButton';
import { SELETOR_FOCAVEL, alvoDoTab, focoInicial } from '@/lib/focus-trap';
import Button from '@/components/ui/Button';

/**
 * O único diálogo do painel.
 *
 * Dez modais copiaram o esqueleto deste componente e deixaram o comportamento
 * para trás: nenhum prendia o foco, nenhum travava a rolagem, nenhum fechava no
 * `Esc` e nenhum tinha nome acessível. Por isso `surface`, `header`, `height`,
 * `bodyClassName` e `footer` moram aqui em vez de num segundo componente — uma
 * só implementação de foco preso é o ponto inteiro.
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Nome acessível do diálogo. Obrigatório mesmo com `header` próprio: com
   * `role="dialog"` e sem `aria-labelledby`, o leitor de tela anuncia
   * "diálogo" e mais nada.
   */
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Largura no desktop, em classe Tailwind. */
  width?: string;
  /** Altura no desktop; por omissão o conteúdo manda, até 90vh. */
  height?: string;
  /** `card` para formulário e confirmação; `sunken` para painel de detalhe. */
  surface?: 'card' | 'sunken';
  /** Cabeçalho próprio. Substitui a linha de título; `title` continua a nomear. */
  header?: ReactNode;
  /** Classe do corpo; por omissão `p-6`. Passe `''` para gerir o seu. */
  bodyClassName?: string;
  /** Rodapé próprio. `null` remove o "Voltar" do celular. */
  footer?: ReactNode | null;
  /**
   * `row` empilha cabeçalho e corpo lado a lado no desktop — é o formato do
   * diálogo de ajustes, com barra lateral de secções em vez de título.
   */
  direction?: 'col' | 'row';
}

const SUPERFICIE = {
  card: 'bg-white dark:bg-card-dark sm:rounded-xl',
  sunken:
    'bg-slate-50 dark:bg-surface-sunken sm:rounded-xl sm:ring-1 ring-black/5 dark:ring-white/5',
} as const;

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'sm:max-w-3xl',
  height = 'sm:h-auto sm:max-h-[90vh]',
  surface = 'card',
  header,
  bodyClassName = 'p-6',
  footer,
  direction = 'col',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useModalBackButton(isOpen, onClose);

  const focaveis = useCallback(() => {
    const todos = Array.from(modalRef.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL) ?? []).filter(
      (el) => !el.hasAttribute('disabled'),
    );
    // O X do desktop e o "Voltar" do celular são `display: none` conforme a
    // largura — focar um deles falha em silêncio e quebra a volta do Tab. Por
    // isso o filtro geométrico. Mas jsdom não tem layout (`offsetParent` é
    // sempre null): se a geometria não vê ninguém, a lista crua vale.
    const visiveis = todos.filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
    return visiveis.length > 0 ? visiveis : todos;
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;

      const lista = focaveis();
      if (lista.length === 0) {
        e.preventDefault();
        return;
      }
      const atual = lista.indexOf(document.activeElement as HTMLElement);
      const alvo = alvoDoTab(lista, atual, e.shiftKey);
      if (alvo === null) return; // o navegador resolve sozinho
      e.preventDefault();
      lista[alvo].focus();
    },
    [onClose, focaveis],
  );

  // Trava a rolagem do fundo e escuta o teclado enquanto aberto.
  useEffect(() => {
    if (!isOpen) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', handleKeyDown);
    };
    // `handleKeyDown` fica nas dependências de propósito: ele fecha sobre
    // `onClose`, e um `onClose` novo depois de aberto tem de ser o que o Esc chama.
  }, [isOpen, handleKeyDown]);

  // Guarda quem abriu, foca o primeiro elemento, devolve o foco ao fechar.
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const t = setTimeout(() => {
        const lista = focaveis();
        const i = focoInicial(lista);
        if (i !== null) lista[i].focus();
        else {
          modalRef.current?.setAttribute('tabindex', '-1');
          modalRef.current?.focus();
        }
      }, 0);
      return () => clearTimeout(t);
    }
    previousFocusRef.current?.focus?.();
    previousFocusRef.current = null;
  }, [isOpen, focaveis]);

  if (!isOpen) return null;

  const rodape =
    footer === null ? null : (
      footer ?? (
        <div className="sm:hidden px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <Button onClick={onClose} icon="arrow_back" size="lg" block>
            Voltar
          </Button>
        </div>
      )
    );

  return (
    <div className="fixed inset-0 z-50 !mt-0 sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-slate-900/50 sm:backdrop-blur-sm">
      <div className="absolute inset-0 hidden sm:block" onClick={onClose} aria-hidden="true" />
      <div
        ref={modalRef}
        className={`absolute inset-0 sm:relative sm:inset-auto ${SUPERFICIE[surface]} w-full ${width} ${height} flex flex-col ${direction === 'row' ? 'sm:flex-row' : ''} overflow-hidden sm:shadow-2xl sm:animate-in sm:fade-in sm:zoom-in-95 duration-200`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {header ? (
          <>
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
            {header}
          </>
        ) : (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:shadow-none">
            <div className="min-w-0 flex-1 pr-2">
              <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {title}
              </h2>
              {subtitle ? (
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mt-0.5">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar diálogo"
              className="hidden sm:flex p-1 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[24px]">
                close
              </span>
            </button>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto custom-scrollbar ${bodyClassName}`}>{children}</div>

        {rodape}
      </div>
    </div>
  );
}
