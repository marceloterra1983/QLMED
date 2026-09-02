// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useModalBackButton } from '../useModalBackButton';

function Dialogo() {
  const [aberto, setAberto] = useState(true);
  useModalBackButton(aberto, () => setAberto(false));
  return aberto ? <div role="dialog">aberto</div> : null;
}

/**
 * jsdom não percorre o histórico: `history.back()` não entrega `popstate`.
 * Simula-se o navegador: o estado da página em que o back aterra, e o evento.
 */
const backDoNavegador = () =>
  act(async () => {
    const state = { __NA: true };
    history.replaceState(state, '');
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });

describe('useModalBackButton', () => {
  it('o back do utilizador fecha o diálogo', async () => {
    render(<Dialogo />);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    await backDoNavegador();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * StrictMode monta, desmonta e remonta o efeito: push, back, push. O
   * popstate desse back chegava ao listener remontado e fechava o diálogo
   * ~10 ms depois de abrir — todo modal do painel morria em dev.
   */
  it('em StrictMode o popstate do back do próprio cleanup não fecha', async () => {
    render(
      <StrictMode>
        <Dialogo />
      </StrictMode>,
    );
    await backDoNavegador();
    expect(screen.queryByRole('dialog')).not.toBeNull();
    // O sinal foi consumido: o back seguinte é do utilizador e fecha.
    await backDoNavegador();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
