// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Primeiro teste de RENDER do QLMED (auditoria b177b07, QLMED-TEST-001).
 *
 * Antes disto o repositório tinha 97 ficheiros `.test.ts` e zero `.test.tsx`:
 * o "contrato" das páginas era `readFileSync` do próprio fonte + `toMatch` de
 * regex. Um teste assim passa mesmo quando o componente não renderiza, e passa
 * de novo depois de qualquer refactor que mova a string — ele prova que uma
 * string existe no ficheiro, não que a tela mostra o que devia.
 *
 * Este monta a lista de NF-e recebidas de verdade (`page-client.tsx`), com o
 * `fetch` sob controlo, e afirma comportamento: o que a página PEDE à API e o
 * que ela MOSTRA com a resposta.
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

import InvoicesPage from '../page-client';

type FetchCall = string;

const calls: FetchCall[] = [];

// Emitida hoje: a página agrupa por período e recolhe os meses antigos por
// padrão (`defaultNfeCollapsedKeys`). O grupo "Hoje" nasce expandido, que é
// onde queremos ver as linhas de verdade no DOM.
const today = new Date();
const todayIso = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  12,
  0,
  0,
).toISOString();

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    number: '000123',
    accessKey: '3'.repeat(44),
    senderName: 'FORNECEDOR ALFA LTDA',
    senderCnpj: '11222333000181',
    recipientName: 'QL MED',
    issueDate: todayIso,
    totalValue: 1234.56,
    status: 'authorized',
    type: 'NFE',
    cfop: '5102',
    ...overrides,
  };
}

/** Responde a todas as chamadas que a página faz no mount. */
function stubFetch(payload: { invoices: unknown[]; total: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      calls.push(url);

      if (url.startsWith('/api/contacts/nickname/batch')) {
        return { ok: true, json: async () => ({ nicknames: {} }) } as unknown as Response;
      }
      // As sondas de "anos disponíveis" usam limit=1; não são a lista.
      if (url.includes('limit=1&')) {
        return { ok: true, json: async () => ({ invoices: [], pagination: { total: 0 } }) } as unknown as Response;
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

/** A chamada que carrega a lista (não as sondas de ano nem os apelidos). */
function listCall(): string {
  const found = calls.find(
    (url) => url.startsWith('/api/invoices?') && !url.includes('limit=1&'),
  );
  expect(found, 'a página não chamou /api/invoices para carregar a lista').toBeTruthy();
  return found as string;
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('lista fiscal de NF-e recebidas — render', () => {
  it('renderiza as notas devolvidas pela API', async () => {
    stubFetch({
      invoices: [
        invoice(),
        invoice({ id: 'inv-2', number: '000124', senderName: 'FORNECEDOR BETA SA' }),
      ],
      total: 2,
    });

    render(<InvoicesPage />);

    // A tabela de desktop é a superfície canônica da lista.
    const table = await screen.findByRole('table');
    await waitFor(() => {
      expect(within(table).getAllByText('000123').length).toBeGreaterThan(0);
    });
    expect(within(table).getAllByText('000124').length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/FORNECEDOR ALFA/).length).toBeGreaterThan(0);
  });

  it('pede NF-e recebidas: type=NFE e direction=received', async () => {
    // O teste de regressão que a auditoria pediu por nome: quebrar
    // `direction=received` tem de reprovar por COMPORTAMENTO — a página passa a
    // pedir outra coisa à API — e não por uma regex sumir do fonte.
    stubFetch({ invoices: [invoice()], total: 1 });

    render(<InvoicesPage />);
    await screen.findByRole('table');

    await waitFor(() => {
      const url = listCall();
      expect(url).toContain('type=NFE');
      expect(url).toContain('direction=received');
    });
  });

  it('avisa que a lista está truncada quando o total passa do que foi carregado', async () => {
    // QLMED-UI-001: a API tem teto de 5000 e a página pedia limit=5000, mas
    // imprimia pagination.total. Com 5001 no filtro, a tela dizia "5001" sob
    // 5000 linhas — o operador concluía que tinha conferido o período inteiro.
    stubFetch({ invoices: [invoice(), invoice({ id: 'inv-2', number: '000124' })], total: 5001 });

    render(<InvoicesPage />);
    await screen.findByRole('table');

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('2 de 5001 nota(s)');
    expect(status.textContent).toMatch(/truncada/i);
  });

  it('não avisa nada quando a página carregou tudo', async () => {
    stubFetch({ invoices: [invoice(), invoice({ id: 'inv-2', number: '000124' })], total: 2 });

    render(<InvoicesPage />);
    await screen.findByRole('table');

    await waitFor(() => {
      expect(screen.getAllByText(/2 nota\(s\)/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/truncada/i)).toBeNull();
  });

  it('mostra o estado vazio quando a API não devolve nota nenhuma', async () => {
    stubFetch({ invoices: [], total: 0 });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Nenhuma NF-e encontrada').length).toBeGreaterThan(0);
    });
  });
});
