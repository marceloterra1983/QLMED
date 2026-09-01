// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * REAUD-DATA-014 (cliente). `runBackfill` fazia `while (remaining > 0)` sem
 * tecto nem espera. Uma NF-e que o servidor nunca marca como medida devolve o
 * mesmo `remaining` em todas as voltas, e o browser martelava
 * POST /api/invoices/backfill-tax indefinidamente, com 200 parses e escritas
 * por volta.
 *
 * Este teste monta a página de verdade, com `fetch` sob controlo, e MEDE
 * quantas vezes o laço chama a rota.
 */

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { toast } from 'sonner';
import FiscalDashboardPage, { BACKFILL_MAX_ROUNDS } from '../page-client';

/**
 * Válvula de segurança: o código ANTIGO não para sozinho. Sem isto, o controlo
 * positivo (reverter a correção) penduraria o runner em vez de reprovar com
 * uma contagem medida. Com a correção nunca dispara.
 */
const SAFETY_VALVE = 1000;

function stubFetch(remainingAt: (call: number) => number) {
  let backfillCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('/api/fiscal/dashboard')) {
        // totalNfe > withTaxData é o que faz a faixa do backfill aparecer.
        return {
          ok: true,
          json: async () => ({ totals: null, monthly: [], topSuppliers: [], totalNfe: 5, withTaxData: 0 }),
        } as unknown as Response;
      }
      if (url.startsWith('/api/fiscal/by-cfop')) {
        return { ok: true, json: async () => ({ byCfop: [] }) } as unknown as Response;
      }
      if (url === '/api/invoices/backfill-tax') {
        backfillCalls++;
        if (backfillCalls > SAFETY_VALVE) throw new Error('válvula de segurança: o laço não parou');
        return {
          ok: true,
          json: async () => ({ ok: true, processed: 0, errors: 1, remaining: remainingAt(backfillCalls) }),
        } as unknown as Response;
      }
      throw new Error(`fetch inesperado: ${url}`);
    }),
  );
  return {
    get backfillCalls() {
      return backfillCalls;
    },
  };
}

const BUTTON = { name: 'Extrair Dados Fiscais' };

/** Clica e espera o laço terminar (o botão sai de "Processando..."). */
async function runBackfillToEnd() {
  fireEvent.click(await screen.findByRole('button', BUTTON));
  expect(screen.getByRole('button', { name: 'Processando...' })).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', BUTTON)).toBeTruthy(), { timeout: 5000 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('dashboard fiscal — o laço do backfill termina', () => {
  it('para quando uma volta não faz remaining cair', async () => {
    const calls = stubFetch(() => 1);
    render(<FiscalDashboardPage />);

    await runBackfillToEnd();

    // 1ª volta: Infinity → 1, houve progresso. 2ª volta: 1 → 1, parou.
    expect(calls.backfillCalls).toBe(2);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('para no tecto de voltas mesmo com progresso lento', async () => {
    // remaining cai 1 por volta, mas nunca chega a 0 dentro do tecto.
    const calls = stubFetch((n) => 10_000 - n);
    render(<FiscalDashboardPage />);

    await runBackfillToEnd();

    expect(calls.backfillCalls).toBe(BACKFILL_MAX_ROUNDS);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('termina normalmente quando remaining chega a 0', async () => {
    const calls = stubFetch((n) => (n === 1 ? 1 : 0));
    render(<FiscalDashboardPage />);

    await runBackfillToEnd();

    expect(calls.backfillCalls).toBe(2);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
