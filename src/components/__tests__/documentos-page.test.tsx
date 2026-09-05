// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CERTIDAO_EMISSAO_URL, CERTIDAO_KINDS_ORDER, CERTIDAO_LABEL } from '@/lib/documentos/constants';
import { DOCUMENTOS_SHARE_RECIPIENTS } from '@/lib/documentos/share-email';
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

function automacaoFor(kind: DocumentosRow['kind']): DocumentosRow['automacao'] {
  if (kind === 'crf_fgts') return 'automatica';
  if (kind === 'cnd_municipal_mobiliario' || kind === 'cnd_municipal_gerais') return 'assistida';
  return 'manual';
}

function missingRow(kind: (typeof CERTIDAO_KINDS_ORDER)[number]): DocumentosRow {
  return {
    id: null,
    kind,
    category: 'certidao',
    label: CERTIDAO_LABEL[kind],
    fileName: null,
    validUntil: null,
    daysRemaining: null,
    status: { key: 'sem_data', label: 'Não encontrada' },
    validUntilSource: null,
    expira: true,
    emissaoUrl: CERTIDAO_EMISSAO_URL[kind],
    emissaoAria: `Emitir ${CERTIDAO_LABEL[kind]}`,
    webUrl: null,
    automacao: automacaoFor(kind),
  };
}

function row(
  kind: (typeof CERTIDAO_KINDS_ORDER)[number],
  overrides: Partial<DocumentosRow>,
): DocumentosRow {
  return {
    id: `doc-${kind}`,
    kind,
    category: 'certidao',
    label: CERTIDAO_LABEL[kind],
    fileName: `${kind}.pdf`,
    validUntil: '2026-12-12',
    daysRemaining: 99,
    status: { key: 'ok', label: 'ok' },
    validUntilSource: 'filename',
    expira: true,
    emissaoUrl: CERTIDAO_EMISSAO_URL[kind],
    emissaoAria: `Emitir ${CERTIDAO_LABEL[kind]}`,
    webUrl: null,
    automacao: automacaoFor(kind),
    ...overrides,
  };
}

function listing(overrides: Partial<DocumentosListing> = {}): DocumentosListing {
  const certidoes: DocumentosRow[] = [
    row('cnd_federal', {
      id: 'doc-federal',
      fileName: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
      validUntil: '2026-12-12',
      daysRemaining: 99,
      status: { key: 'ok', label: 'ok' },
    }),
    row('crf_fgts', {
      id: 'doc-fgts',
      fileName: 'CERTIDAO FGTS 01.09.26 QL MED.pdf',
      validUntil: '2026-09-01',
      daysRemaining: -3,
      status: { key: 'vencida', label: 'vencida há 3 dias' },
    }),
    row('cndt', {
      daysRemaining: 1,
      status: { key: 'urgente', label: 'urgente' },
    }),
    row('cnd_estadual_ms', {
      daysRemaining: 0,
      status: { key: 'hoje', label: 'vence hoje' },
    }),
    row('cnd_estadual_mt', {
      daysRemaining: 7,
      status: { key: 'urgente', label: 'urgente' },
    }),
    row('cnd_municipal_mobiliario', {
      daysRemaining: 8,
      status: { key: 'atencao', label: 'atenção' },
    }),
    missingRow('cnd_municipal_gerais'),
  ];

  return {
    certidoes,
    sanitaria: [],
    cartas: [],
    societario: [],
    basicos: [],
    balancos: [],
    ingest: { lastSuccessAt: '2026-09-04T14:30:00.000Z', lastError: null },
    shareRecipients: DOCUMENTOS_SHARE_RECIPIENTS.map(({ email, label }) => ({ email, label })),
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

describe('Cadastro › Documentos (SPEC-042 L9)', () => {
  it('renderiza as 7 certidões na ordem, sem histórico, sem coluna Arquivo e sem Outros', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);

    const table = await screen.findByRole('table', { name: 'Certidões' });
    for (const kind of CERTIDAO_KINDS_ORDER) {
      expect(within(table).getByText(CERTIDAO_LABEL[kind])).toBeTruthy();
    }

    const bodyRows = [...table.querySelectorAll('tbody tr')];
    expect(bodyRows).toHaveLength(7);
    expect(bodyRows.map((r) => within(r as HTMLElement).getByText(/CND|CRF|CNDT/).textContent)).toEqual(
      CERTIDAO_KINDS_ORDER.map((kind) => CERTIDAO_LABEL[kind]),
    );

    expect(screen.queryByRole('columnheader', { name: 'Arquivo' })).toBeNull();
    expect(screen.queryByText('Histórico')).toBeNull();
    expect(screen.queryByText('Outros arquivos na pasta')).toBeNull();
    expect(screen.queryByText('arquivo-avulso.pdf')).toBeNull();
    expect(screen.queryByText('CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf')).toBeNull();
  });

  it('mostra o texto exato de dias nos cinco casos e destaca 7, não 8', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    const table = await screen.findByRole('table', { name: 'Certidões' });

    const federal = within(table).getByText(CERTIDAO_LABEL.cnd_federal).closest('tr')!;
    expect(within(federal).getByText('99 dias')).toBeTruthy();
    expect(within(federal).getByText('99 dias').getAttribute('data-destaque')).toBeNull();

    const fgts = within(table).getByText(CERTIDAO_LABEL.crf_fgts).closest('tr')!;
    expect(within(fgts).getByText('vencida há 3 dias')).toBeTruthy();
    expect(within(fgts).getByText('vencida há 3 dias').getAttribute('data-destaque')).toBe('true');

    const cndt = within(table).getByText(CERTIDAO_LABEL.cndt).closest('tr')!;
    expect(within(cndt).getByText('1 dia')).toBeTruthy();

    const ms = within(table).getByText(CERTIDAO_LABEL.cnd_estadual_ms).closest('tr')!;
    expect(within(ms).getByText('vence hoje')).toBeTruthy();
    expect(within(ms).getByText('vence hoje').getAttribute('data-destaque')).toBe('true');

    const mt = within(table).getByText(CERTIDAO_LABEL.cnd_estadual_mt).closest('tr')!;
    expect(within(mt).getByText('7 dias').getAttribute('data-destaque')).toBe('true');

    const mobiliario = within(table).getByText(CERTIDAO_LABEL.cnd_municipal_mobiliario).closest('tr')!;
    expect(within(mobiliario).getByText('8 dias').getAttribute('data-destaque')).toBeNull();

    const gerais = within(table).getByText(CERTIDAO_LABEL.cnd_municipal_gerais).closest('tr')!;
    expect(within(gerais).getByText('—')).toBeTruthy();
  });

  it('abre o PDF em popup com iframe na rota certa, sem window.open', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Ver documento' })[0]);
    const iframe = await screen.findByTitle('Preview do documento');
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('src')).toBe('/api/documentos/doc-federal/arquivo');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('cada uma das 7 linhas tem o link de emissão com href da constante e rel noopener', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    const emitLinks = screen.getAllByRole('link', { name: /Emitir / });
    expect(emitLinks).toHaveLength(7);
    for (const kind of CERTIDAO_KINDS_ORDER) {
      const href = CERTIDAO_EMISSAO_URL[kind];
      const link = emitLinks.find((el) => el.getAttribute('href') === href);
      expect(link).toBeTruthy();
      expect(link!.getAttribute('target')).toBe('_blank');
      expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('o lápis só existe para canWrite, tem aria-label, e o card recolhe/expande', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    const table = await screen.findByRole('table', { name: 'Certidões' });

    const federal = within(table).getByText(CERTIDAO_LABEL.cnd_federal).closest('tr')!;
    fireEvent.click(within(federal).getByRole('button', { name: 'Mais opções' }));
    expect(within(federal).getByRole('button', { name: 'Editar validade' })).toBeTruthy();

    const gerais = within(table).getByText(CERTIDAO_LABEL.cnd_municipal_gerais).closest('tr')!;
    fireEvent.click(within(gerais).getByRole('button', { name: 'Mais opções' }));
    expect(within(gerais).queryByRole('button', { name: 'Editar validade' })).toBeNull();

    const toggle = screen.getByRole('button', { name: /Certidões/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    cleanup();
    roleState.canWrite = false;
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });
    expect(screen.queryByRole('button', { name: /Editar validade/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Atualizar do OneDrive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar arquivo' })).toBeNull();
  });

  it('linha sem documento não nasce em edição; canWrite=false nenhuma linha edita', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    const table = await screen.findByRole('table', { name: 'Certidões' });
    const gerais = within(table).getByText(CERTIDAO_LABEL.cnd_municipal_gerais).closest('tr')!;

    expect(within(gerais).queryByLabelText('Validade')).toBeNull();
    expect(within(gerais).queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(within(gerais).queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(screen.queryByLabelText('Validade')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();

    cleanup();
    roleState.canWrite = false;
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });
    expect(screen.queryByLabelText('Validade')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar validade/ })).toBeNull();
  });

  it('Cancelar limpa o rascunho para não pinar a data noutra linha', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    const table = screen.getByRole('table', { name: 'Certidões' });
    const federal = within(table).getByText(CERTIDAO_LABEL.cnd_federal).closest('tr')!;
    fireEvent.click(within(federal).getByRole('button', { name: 'Mais opções' }));
    fireEvent.click(within(federal).getByRole('button', { name: 'Editar validade' }));
    const input = screen.getByLabelText('Validade') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2027-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Validade')).toBeNull();
    const fgts = within(table).getByText(CERTIDAO_LABEL.crf_fgts).closest('tr')!;
    fireEvent.click(within(fgts).getByRole('button', { name: 'Mais opções' }));
    fireEvent.click(within(fgts).getByRole('button', { name: 'Editar validade' }));
    expect((screen.getByLabelText('Validade') as HTMLInputElement).value).toBe('2026-09-01');
  });

  it('Imprimir usa o visualizador, sem ?print=true', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Ver documento' })[0]);
    const iframe = await screen.findByTitle('Preview do documento');
    const printSpy = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { print: printSpy },
      configurable: true,
    });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'CND Receita Federal' })).getByRole('button', { name: 'Imprimir' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('mostra botões de escrita só para editor/admin', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });
    expect(screen.getByRole('button', { name: 'Atualizar do OneDrive' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar arquivo' })).toBeTruthy();

    cleanup();
    roleState.canWrite = false;
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });
    expect(screen.queryByRole('button', { name: 'Atualizar do OneDrive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar arquivo' })).toBeNull();
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

  it('Baixar continua link direto; 409 do sync vira toast', async () => {
    stubFetch((url, init) => {
      if (url === '/api/documentos/sync' && init?.method === 'POST') {
        return jsonResponse({ error: 'ingestão de documentos já em curso' }, { status: 409 });
      }
      return jsonResponse(listing());
    });
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.getAttribute('href')).toBe('/api/documentos/doc-federal/arquivo?download=1');
      expect(this.hasAttribute('download')).toBe(true);
    });
    const table = screen.getByRole('table', { name: 'Certidões' });
    const federal = within(table).getByText(CERTIDAO_LABEL.cnd_federal).closest('tr')!;
    fireEvent.click(within(federal).getByRole('button', { name: 'Mais opções' }));
    fireEvent.click(within(federal).getByRole('button', { name: 'Baixar' }));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar do OneDrive' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('já em andamento');
    });
  });
});

describe('SPEC-042 — a data de validade não pode deslizar de fuso', () => {
  it('mostra 12/12/2026, e não o dia anterior, para validUntil 2026-12-12', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);

    const linha = (await screen.findByText('CND Receita Federal')).closest('tr')!;
    expect(within(linha).getByText('12/12/2026')).toBeTruthy();
    expect(within(linha).queryByText('11/12/2026')).toBeNull();
  });

  it('a data vencida da FGTS também não desliza', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);

    const linha = (await screen.findByText('CRF FGTS')).closest('tr')!;
    expect(within(linha).getByText('01/09/2026')).toBeTruthy();
    expect(within(linha).queryByText('31/08/2026')).toBeNull();
  });
});

describe('SPEC-042 L10 — três famílias na mesma página', () => {
  it('três cards: certidões e sanitária abertos, cartas recolhidas', async () => {
    stubFetch(() => jsonResponse(listing({
      sanitaria: [
        {
          id: 'doc-afe',
          kind: 'afe_anvisa',
          category: 'sanitaria',
          label: 'AFE — Autorização de Funcionamento ANVISA',
          fileName: 'AFE - EMITIDO EM 06.01.2026.pdf',
          validUntil: null,
          daysRemaining: null,
          status: { key: 'nao_vence', label: 'não vence' },
          validUntilSource: null,
          expira: false,
          emissaoUrl: null,
          emissaoAria: null,
          webUrl: null,
          automacao: null,
        },
      ],
    })));
    render(<DocumentosPageClient />);

    expect((await screen.findByRole('button', { name: /Certidões/ })).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /Autorizações sanitárias/ }).getAttribute('aria-expanded')).toBe('true');
    const cartas = screen.getByRole('button', { name: /Cartas de comercialização/ });
    expect(cartas.getAttribute('aria-expanded')).toBe('false');

    const sanitaria = screen.getByRole('table', { name: 'Autorizações sanitárias' });
    expect(within(sanitaria).getByText('AFE — Autorização de Funcionamento ANVISA')).toBeTruthy();
    expect(within(sanitaria).getByText('não vence')).toBeTruthy();
    expect(within(sanitaria).queryByRole('button', { name: /Editar validade/ })).toBeNull();
  });
});

describe('SPEC-042 L11 — contrato social, básicos e balanços na página', () => {
  it('três cards novos recolhidos; balanços sem coluna de prazo, sem Ver, com Abrir no OneDrive', async () => {
    stubFetch(() => jsonResponse(listing({
      societario: [
        {
          id: 'doc-cons',
          kind: 'contrato_social_consolidado',
          category: 'societario',
          label: 'Contrato Social — Consolidado',
          fileName: 'CONTRATO SOCIAL- CONSTITUIÇÃO + ULTIMA ALTERAÇÃO.pdf',
          validUntil: null,
          daysRemaining: null,
          status: { key: 'nao_vence', label: 'não vence' },
          validUntilSource: null,
          expira: false,
          emissaoUrl: null,
          emissaoAria: null,
          webUrl: null,
          automacao: null,
        },
      ],
      basicos: [
        {
          id: 'doc-cnpj',
          kind: 'cartao_cnpj',
          category: 'basicos',
          label: 'Cartão CNPJ',
          fileName: 'CARTÃO CNPJ 31.08.26.pdf',
          validUntil: null,
          daysRemaining: null,
          status: { key: 'nao_vence', label: 'não vence' },
          validUntilSource: null,
          expira: false,
          emissaoUrl: null,
          emissaoAria: null,
          webUrl: null,
          automacao: null,
        },
      ],
      balancos: [
        {
          id: 'doc-bal-2026',
          kind: 'balanco_anual',
          category: 'balanco',
          label: '2026',
          fileName: 'BALANÇO 2026',
          validUntil: null,
          daysRemaining: null,
          status: { key: 'nao_vence', label: 'não vence' },
          validUntilSource: null,
          expira: false,
          emissaoUrl: null,
          emissaoAria: null,
          webUrl: 'https://onedrive.example/balanco-2026',
          automacao: null,
        },
      ],
    })));
    render(<DocumentosPageClient />);

    expect((await screen.findByRole('button', { name: /Contrato social/ })).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: /Documentos básicos/ }).getAttribute('aria-expanded')).toBe('false');
    const balancosToggle = screen.getByRole('button', { name: /Balanços/ });
    expect(balancosToggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(balancosToggle);
    const table = await screen.findByRole('table', { name: 'Balanços' });
    expect(within(table).getByText('2026')).toBeTruthy();
    expect(within(table).queryByRole('columnheader', { name: 'Válida até' })).toBeNull();
    expect(within(table).queryByRole('columnheader', { name: 'Dias restantes' })).toBeNull();
    expect(within(table).queryByText('não vence')).toBeNull();
    expect(within(table).queryByRole('button', { name: 'Ver documento' })).toBeNull();
    expect(within(table).queryByRole('button', { name: /Editar validade/ })).toBeNull();
    expect(within(table).queryByRole('button', { name: 'Mais opções' })).toBeNull();
    const open = within(table).getByRole('link', { name: 'Abrir pasta no OneDrive' });
    expect(open.getAttribute('href')).toBe('https://onedrive.example/balanco-2026');
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('SPEC-042 L12 — linha clicável, padrão de ícones e tags', () => {
  it('clicar em Ver não abre o modal de atualização', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Ver documento' })[0]);
    expect(screen.queryByRole('dialog', { name: 'Atualizar CND Receita Federal' })).toBeNull();
    expect(screen.getByTitle('Preview do documento')).toBeTruthy();
  });

  it('clicar na linha ou Enter abre o modal de atualização', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    await screen.findByRole('table', { name: 'Certidões' });

    fireEvent.click(screen.getByRole('button', { name: 'Abrir atualização de CND Receita Federal' }));
    expect(await screen.findByRole('dialog', { name: 'Atualizar CND Receita Federal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Anexar PDF' })).toBeTruthy();
  });

  it('balanço não abre modal de atualização e não tem kebab', async () => {
    stubFetch(() => jsonResponse(listing({
      balancos: [
        {
          id: 'doc-bal-2026',
          kind: 'balanco_anual',
          category: 'balanco',
          label: '2026',
          fileName: 'BALANÇO 2026',
          validUntil: null,
          daysRemaining: null,
          status: { key: 'nao_vence', label: 'não vence' },
          validUntilSource: null,
          expira: false,
          emissaoUrl: null,
          emissaoAria: null,
          webUrl: 'https://onedrive.example/balanco-2026',
          automacao: null,
        },
      ],
    })));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<DocumentosPageClient />);
    fireEvent.click(await screen.findByRole('button', { name: /Balanços/ }));
    const table = await screen.findByRole('table', { name: 'Balanços' });
    expect(within(table).queryByRole('button', { name: 'Mais opções' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pasta 2026 no OneDrive' }));
    expect(screen.queryByRole('dialog', { name: /Atualizar/ })).toBeNull();
    expect(openSpy).toHaveBeenCalledWith(
      'https://onedrive.example/balanco-2026',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('ícones do padrão: Ver documento, Imprimir, menu com Compartilhar', async () => {
    stubFetch(() => jsonResponse(listing()));
    render(<DocumentosPageClient />);
    const table = await screen.findByRole('table', { name: 'Certidões' });
    const federal = within(table).getByText(CERTIDAO_LABEL.cnd_federal).closest('tr')!;
    expect(within(federal).getByRole('button', { name: 'Ver documento' })).toBeTruthy();
    expect(within(federal).getByRole('button', { name: 'Imprimir' })).toBeTruthy();
    fireEvent.click(within(federal).getByRole('button', { name: 'Mais opções' }));
    expect(within(federal).getByRole('button', { name: 'Compartilhar' })).toBeTruthy();
    expect(within(federal).getByRole('button', { name: 'Baixar' })).toBeTruthy();
    expect(within(federal).getByRole('button', { name: 'Atualizar arquivo' })).toBeTruthy();
    expect(within(federal).getByRole('button', { name: 'Editar validade' })).toBeTruthy();
  });

  it('tags: só o FGTS é Automática; municipais Assistida; o resto Manual; AFE sem tag', async () => {
    stubFetch(() => jsonResponse(listing({
      sanitaria: [
        {
          id: 'doc-afe',
          kind: 'afe_anvisa',
          category: 'sanitaria',
          label: 'AFE — Autorização de Funcionamento ANVISA',
          fileName: 'AFE - EMITIDO EM 06.01.2026.pdf',
          validUntil: null,
          daysRemaining: null,
          status: { key: 'nao_vence', label: 'não vence' },
          validUntilSource: null,
          expira: false,
          emissaoUrl: null,
          emissaoAria: null,
          webUrl: null,
          automacao: null,
        },
      ],
    })));
    render(<DocumentosPageClient />);
    const table = await screen.findByRole('table', { name: 'Certidões' });
    const federal = within(table).getByText(CERTIDAO_LABEL.cnd_federal).closest('tr')!;
    const fgts = within(table).getByText(CERTIDAO_LABEL.crf_fgts).closest('tr')!;
    const mobiliario = within(table).getByText(CERTIDAO_LABEL.cnd_municipal_mobiliario).closest('tr')!;
    expect(within(federal).getByText('Manual')).toBeTruthy();
    expect(within(fgts).getByText('Automática')).toBeTruthy();
    expect(within(mobiliario).getByText('Assistida')).toBeTruthy();
    const sanitaria = screen.getByRole('table', { name: 'Autorizações sanitárias' });
    expect(within(sanitaria).queryByText('Automática')).toBeNull();
    expect(within(sanitaria).queryByText('Manual')).toBeNull();
    expect(within(sanitaria).queryByText('Assistida')).toBeNull();
  });
});
