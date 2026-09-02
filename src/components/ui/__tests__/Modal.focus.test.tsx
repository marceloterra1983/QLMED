// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from '../Modal';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const dialogo = (isOpen: boolean) => (
  <Modal isOpen={isOpen} onClose={() => {}} title="Diálogo">
    <button>dentro</button>
  </Modal>
);

/** O botão que abriu fica fora do Modal, focado, como na página real. */
function comOpener() {
  const opener = document.createElement('button');
  opener.textContent = 'abrir';
  document.body.appendChild(opener);
  opener.focus();
  return opener;
}

describe('Modal: devolução do foco', () => {
  it('ao abrir move o foco para dentro; ao fechar por isOpen=false devolve ao opener', async () => {
    const opener = comOpener();
    const { rerender } = render(dialogo(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
    rerender(dialogo(false));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  /**
   * NfeDetailsModal, InvoiceDetailsModal e outros devolvem `null` quando
   * fechados: o Modal desmonta em vez de receber `isOpen=false`. A devolução
   * vivia no ramo `!isOpen` e nunca corria — o foco caía no <body>.
   */
  it('ao desmontar devolve o foco ao opener', async () => {
    const opener = comOpener();
    const { unmount } = render(dialogo(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
