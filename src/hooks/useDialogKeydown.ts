import { useCallback, useEffect, type RefObject } from 'react';

export const DIALOG_FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Escape fecha, Tab não sai do diálogo.
 *
 * Auditoria b177b07 (QLMED-UI-004): o repositório tinha DOIS componentes de
 * diálogo modal. O `Modal` prendia o foco; o `ConfirmDialog` — usado nas
 * confirmações de exclusão das listas fiscais — só tratava Escape. Com
 * `aria-modal="true"` declarado e o Tab escapando para a página por baixo, um
 * utilizador de teclado saía do diálogo sem o fechar e podia acionar um botão
 * que a tela dizia estar bloqueado.
 *
 * O trap vive aqui, num sítio só, porque a versão duplicada foi exatamente o
 * que permitiu os dois divergirem.
 */
export function useDialogKeydown(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !containerRef.current) return;

      const candidates = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute('disabled'));

      // `offsetParent` descarta o par mobile/desktop escondido por Tailwind.
      // Em ambiente sem layout (jsdom) ele é sempre null, então caímos para a
      // lista completa em vez de concluir "não há nada focável" — a alternativa
      // seria um trap que só funciona no browser e nunca é testado.
      const visible = candidates.filter((element) => element.offsetParent !== null);
      const focusable = visible.length > 0 ? visible : candidates;

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [containerRef, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);
}
