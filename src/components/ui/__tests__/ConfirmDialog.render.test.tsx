// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/useModalBackButton', () => ({
  useModalBackButton: () => {},
}));

import ConfirmDialog from '../ConfirmDialog';

/**
 * QLMED-UI-004 — o ConfirmDialog declarava `aria-modal="true"` e tratava só
 * Escape. O Tab escapava para a página por baixo: o utilizador de teclado saía
 * do diálogo de confirmação de EXCLUSÃO de nota fiscal sem o fechar, e podia
 * acionar controles que a tela apresentava como bloqueados.
 *
 * Este teste é de comportamento: move o foco de verdade e observa onde ele fica.
 */

afterEach(cleanup);

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <>
      <button type="button">fora do diálogo</button>
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Excluir nota"
        message="Tem certeza que deseja excluir esta nota fiscal?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        {...overrides}
      />
    </>,
  );
  return { onClose, onConfirm };
}

function dialogButtons(): HTMLElement[] {
  const dialog = screen.getByRole('dialog');
  return Array.from(dialog.querySelectorAll('button'));
}

describe('ConfirmDialog — foco preso no diálogo', () => {
  it('Tab no último elemento volta para o primeiro, dentro do diálogo', () => {
    renderDialog();

    const buttons = dialogButtons();
    expect(buttons.length).toBeGreaterThan(1);

    const last = buttons[buttons.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(window, { key: 'Tab' });

    expect(document.activeElement).toBe(buttons[0]);
    // Controlo do controlo: o foco NÃO foi parar no botão de fora.
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: 'fora do diálogo' }),
    );
  });

  it('Shift+Tab no primeiro elemento volta para o último', () => {
    renderDialog();

    const buttons = dialogButtons();
    const first = buttons[0];
    first.focus();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it('Escape continua a fechar', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fechado, não renderiza nem escuta o teclado', () => {
    const { onClose } = renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
