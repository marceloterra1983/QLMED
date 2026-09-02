// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin', allowedPages: [] } }, status: 'authenticated' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/useModalBackButton', () => ({
  useModalBackButton: () => {},
}));

import FinanceiroPageClient from '../FinanceiroPageClient';

/**
 * QLMED-UI-002 — o backfill de duplicatas processa um lote de 500 XML por GET.
 * Enquanto o histórico não fecha, a tela do financeiro mostra menos contas do
 * que existem. Antes desta correção ela não dizia nada: o operador via um total
 * com cara de definitivo.
 */

function stubFetch(coverage: { remaining: number } | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        duplicatas: [],
        summary: {
          total: 0,
          totalValor: 0,
          hoje: 0,
          hojeValor: 0,
          estaSemana: 0,
          estaSemanaValor: 0,
          esteMes: 0,
          esteMesValor: 0,
          proximoMes: 0,
          proximoMesValor: 0,
          vencidas: 0,
          vencidasValor: 0,
          venceHoje: 0,
          venceHojeValor: 0,
        },
        coverage,
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      }),
    })) as unknown as typeof fetch,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('financeiro — aviso de cobertura incompleta', () => {
  it('avisa quando ainda faltam notas por processar', async () => {
    stubFetch({ remaining: 137 });

    render(<FinanceiroPageClient direction="pagar" />);

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Cobertura incompleta');
    expect(status.textContent).toContain('137');
  });

  it('não avisa quando a cobertura está completa', async () => {
    stubFetch({ remaining: 0 });

    render(<FinanceiroPageClient direction="pagar" />);

    await waitFor(() => {
      expect(screen.queryAllByText(/Cobertura incompleta/).length).toBe(0);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('não avisa quando a API antiga não manda coverage', async () => {
    // Compatibilidade: um deploy intermediário sem o campo não pode passar a
    // gritar "cobertura incompleta" sem base nenhuma.
    stubFetch(undefined);

    render(<FinanceiroPageClient direction="pagar" />);

    await waitFor(() => {
      expect(screen.queryAllByText(/Cobertura incompleta/).length).toBe(0);
    });
  });
});
