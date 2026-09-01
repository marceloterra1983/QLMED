// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Render da lista de NFS-e recebidas (auditoria b177b07, QLMED-TEST-001).
 *
 * Esta é a página que a auditoria nomeou como critério de sucesso: quebrar
 * `direction=received` aqui tem de reprovar um teste de COMPORTAMENTO, não uma
 * regex sobre o texto-fonte. `direction` é o que separa a nota que a QLMED
 * RECEBEU da que ela EMITIU; trocá-lo silenciosamente troca a natureza fiscal
 * do que a tela apresenta, e um `toMatch(/direction=received/)` sobre o
 * ficheiro continuaria verde se a string ainda existisse em qualquer outro
 * ponto do módulo.
 */

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin', allowedPages: [] } }, status: 'authenticated' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/useModalBackButton', () => ({
  useModalBackButton: () => {},
}));

import NfseRecebidasPage from '../page-client';

const calls: string[] = [];

const today = new Date();
const todayIso = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  12,
  0,
  0,
).toISOString();

function nfse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'nfse-1',
    number: '000777',
    accessKey: null,
    senderName: 'PRESTADOR DE SERVICO LTDA',
    senderCnpj: '11222333000181',
    recipientName: 'QL MED',
    issueDate: todayIso,
    totalValue: 980.5,
    status: 'authorized',
    type: 'NFSE',
    ...overrides,
  };
}

function stubFetch(payload: { invoices: unknown[]; total: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('/api/contacts/nickname/batch')) {
        return { ok: true, json: async () => ({ nicknames: {} }) } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          invoices: payload.invoices,
          pagination: { total: payload.total },
        }),
      } as unknown as Response;
    }),
  );
}

function invoicesCall(): string {
  const found = calls.find((url) => url.startsWith('/api/invoices?'));
  expect(found, 'a página não chamou /api/invoices').toBeTruthy();
  return found as string;
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('lista fiscal de NFS-e recebidas — render', () => {
  it('renderiza os documentos devolvidos pela API', async () => {
    stubFetch({ invoices: [nfse()], total: 1 });

    render(<NfseRecebidasPage />);

    const table = await screen.findByRole('table');
    await waitFor(() => {
      expect(within(table).getAllByText(/PRESTADOR DE SERVICO/).length).toBeGreaterThan(0);
    });
  });

  it('pede NFS-e recebidas: type=NFSE e direction=received', async () => {
    // O controlo positivo nomeado pela auditoria. Trocar `direction` para
    // 'issued' (ou removê-lo) faz esta asserção falhar, porque ela lê o que a
    // página REALMENTE pediu à API — não o que está escrito no ficheiro.
    stubFetch({ invoices: [nfse()], total: 1 });

    render(<NfseRecebidasPage />);
    await screen.findByRole('table');

    await waitFor(() => {
      const url = invoicesCall();
      expect(url).toContain('type=NFSE');
      expect(url).toContain('direction=received');
      expect(url).not.toContain('direction=issued');
    });
  });

  it('avisa truncamento quando o total passa do que foi carregado', async () => {
    stubFetch({ invoices: [nfse()], total: 6000 });

    render(<NfseRecebidasPage />);
    await screen.findByRole('table');

    const status = await screen.findAllByRole('status');
    expect(status.length).toBeGreaterThan(0);
    expect(status[0].textContent).toContain('1 de 6000 documento(s)');
    expect(status[0].textContent).toMatch(/truncada/i);
  });

  it('não avisa truncamento quando carregou tudo', async () => {
    stubFetch({ invoices: [nfse()], total: 1 });

    render(<NfseRecebidasPage />);
    await screen.findByRole('table');

    await waitFor(() => {
      expect(screen.getAllByText(/1 documento\(s\)/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
