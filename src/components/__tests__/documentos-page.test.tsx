// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CERTIDAO_KINDS_ORDER, CERTIDAO_LABEL } from '@/lib/documentos/constants';
import type { DocumentosListing, DocumentosRow } from '@/lib/documentos/list';

const roleState = vi.hoisted(() => ({ canWrite: true }));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { role: roleState.canWrite ? 'admin' : 'viewer', allowedPages: ['/cadastro/documentos'] } },
    status: 'authenticated',
  }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    canWrite: roleState.canWrite,
    role: roleState.canWrite ? 'admin' : 'viewer',
    isAdmin: roleState.canWrite,
  }),
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/hooks/useModalBackButton', () => ({
  useModalBackButton: () => {},
}));

import DocumentosPageClient from '@/app/(painel)/cadastro/documentos/page-client';

function missingRow(kind: (typeof CERTIDAO_KINDS_ORDER)[number]): DocumentosRow {
  return {
    id: null,
    kind,
    label: CERTIDAO_LABEL[kind],
    fileName: null,
    validUntil: null,
    daysRemaining: null,
    status: { key: 'sem_data', label: 'Não encontrada' },
    validUntilSource: null,
    history: [],
  };
}

function listing(overrides: Partial<DocumentosListing> = {}): DocumentosListing {
  const certidoes = CERTIDAO_KINDS_ORDER.map((kind, index) => {
    if (index === 0) {
      return {
        id: 'doc-federal',
        kind,
        label: CERTIDAO_LABEL[kind],
        fileName: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
        validUntil: '2026-12-12',
        daysRemaining: 99,
        status: { key: 'ok', label: 'ok' },
        validUntilSource: 'filename',
        history: [
          {
            id: 'doc-federal-old',
            fileName: 'CERTIDAO RECEITA FEDERAL 06.07.26- QL MED.pdf',
            validUntil: '2026-07-06',
          },
        ],
      } satisfies DocumentosRow;
    }
    if (index === 1) {
      return {
        id: 'doc-fgts',
        kind,
        label: CERTIDAO_LABEL[kind],
        fileName: 'CERTIDAO FGTS 01.09.26 QL MED.pdf',
        validUntil: '2026-09-01',
        daysRemaining: -3,
        status: { key: 'vencida', label: 'vencida há 3 dias' },
        validUntilSource: 'filename',
        history: [],
      } satisfies DocumentosRow;
    }
    return missingRow(kind);
  });

  return {
    certidoes,
    outros: [
      {
        id: 'doc-outro',
        kind: 'outro',
        label: CERTIDAO_LABEL.outro,
        fileName: 'arquivo-avulso.pdf',
        validUntil: null,
        daysRemaining: null,
        status: { key: 'sem_data', label: 'sem data' },
        validUntilSource: null,
        history: [],
      },
    ],
    ingest: { lastSuccessAt: '2026-09-04T14:30:00.000Z', lastError: null },
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  return {
    ok: init.ok ?? status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init)),
  );
}

beforeEach(() => {
  roleState.canWrite = true;
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Cadastro › Documentos (SPEC-042 L6)', () => {
  it('renderiza as 6 certidões na ordem da API, sem ações nas linhas vazias', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);

    const table = await screen.findByRole('table', { name: 'Certidões' });
    for (const kind of CERTIDAO_KINDS_ORDER) {
      expect(within(table).getByText(CERTIDAO_LABEL[kind])).toBeTruthy();
    }

    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(6);

    const verLinks = screen.getAllByRole('link', { name: 'Ver' });
    expect(verLinks).toHaveLength(2);
    expect(verLinks[0].getAttribute('href')).toBe('/api/documentos/doc-federal/arquivo');
    expect(verLinks[0].getAttribute('target')).toBe('_blank');
    expect(verLinks[0].getAttribute('rel')).toBe('noopener');

    const baixar = screen.getAllByRole('link', { name: 'Baixar' });
    expect(baixar[0].getAttribute('href')).toBe('/api/documentos/doc-federal/arquivo?download=1');
    expect(baixar[0].hasAttribute('download')).toBe(true);

    expect(screen.queryByText('arquivo-avulso.pdf')).toBeNull();
  });

  it('expande o histórico por linha e mostra Ver/Baixar dos anteriores', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    fireEvent.click(screen.getByRole('button', { name: 'Expandir histórico' }));
    expect(await screen.findByText('CERTIDAO RECEITA FEDERAL 06.07.26- QL MED.pdf')).toBeTruthy();
    const verLinks = screen.getAllByRole('link', { name: 'Ver' });
    expect(verLinks).toHaveLength(3);
    expect(verLinks.some((el) => el.getAttribute('href') === '/api/documentos/doc-federal-old/arquivo')).toBe(true);
  });

  it('mostra botões de escrita só para editor/admin', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });
    expect(screen.getByRole('button', { name: 'Atualizar do OneDrive' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar arquivo' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Editar validade' }).length).toBeGreaterThan(0);

    cleanup();
    roleState.canWrite = false;
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });
    expect(screen.queryByRole('button', { name: 'Atualizar do OneDrive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar arquivo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar validade' })).toBeNull();
  });

  it('erro de carga mostra EmptyState e tenta de novo', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'falhou' }, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DocumentosPageClient />);

    expect(await screen.findByText('Não foi possível carregar os documentos')).toBeTruthy();
    fetchMock.mockImplementation(async () => jsonResponse(listing()));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table', { name: 'Certidões' })).toBeTruthy();
  });

  it('abre Outros arquivos só depois do clique e trata 409 do sync', async () => {
    stubFetch((url, init) => {
      if (url === '/api/documentos/sync' && init?.method === 'POST') {
        return jsonResponse({ error: 'ingestão de documentos já em curso' }, { status: 409 });
      }
      return jsonResponse(listing());
    });
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    fireEvent.click(screen.getByRole('button', { name: /Outros arquivos na pasta/ }));
    expect(screen.getByText('arquivo-avulso.pdf')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar do OneDrive' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('já em andamento');
    });
  });
});
