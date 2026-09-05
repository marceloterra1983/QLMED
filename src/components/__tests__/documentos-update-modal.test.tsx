// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentoUpdateModal from '@/app/(painel)/cadastro/documentos/components/DocumentoUpdateModal';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/hooks/useModalBackButton', () => ({
  useModalBackButton: () => {},
}));

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  return {
    ok: init.ok ?? status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

const PDF = new File([new Uint8Array(Buffer.from('%PDF-1.4\n'))], 'crf.pdf', { type: 'application/pdf' });

function renderModal(onUploaded = vi.fn(), onClose = vi.fn()) {
  return render(
    <DocumentoUpdateModal
      isOpen
      onClose={onClose}
      kind="crf_fgts"
      label="CRF FGTS"
      onUploaded={onUploaded}
    />,
  );
}

function dropZone() {
  return screen.getByRole('button', { name: 'Anexar PDF' });
}

async function attachPdf(analisar: unknown = {
  validUntil: '2026-09-29',
  confidence: 'alta',
  matchedLabel: 'Validade',
  textChars: 40,
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/analisar')) return jsonResponse(analisar);
      if (url.includes('/upload') && init?.method === 'POST') return jsonResponse({ id: 'new' });
      return jsonResponse({ error: 'unexpected' }, { status: 500 });
    }),
  );
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
    target: { files: [PDF] },
  });
  await waitFor(() => {
    expect(vi.mocked(fetch)).toHaveBeenCalled();
  });
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DocumentoUpdateModal (SPEC-042 L12)', () => {
  it('validade lida entra pré-preenchida', async () => {
    renderModal();
    await attachPdf();
    expect(await screen.findByText(/Validade encontrada no documento: 29\/09\/2026/)).toBeTruthy();
    const input = screen.getByLabelText(/corrigir se estiver errada/) as HTMLInputElement;
    expect(input.value).toBe('2026-09-29');
  });

  it('confidence media assinala o ano com 2 dígitos e ainda pré-preenche', async () => {
    renderModal();
    await attachPdf({
      validUntil: '2026-09-29',
      confidence: 'media',
      matchedLabel: 'Validade',
      textChars: 20,
    });
    expect(await screen.findByText(/o ano veio com 2 dígitos/)).toBeTruthy();
    expect((screen.getByLabelText(/corrigir se estiver errada/) as HTMLInputElement).value).toBe('2026-09-29');
  });

  it('confidence nenhuma não bloqueia e o campo entra vazio', async () => {
    renderModal();
    await attachPdf({
      validUntil: null,
      confidence: 'nenhuma',
      matchedLabel: null,
      textChars: 0,
    });
    expect(await screen.findByText(/Não foi possível ler a validade neste PDF/)).toBeTruthy();
    expect((screen.getByLabelText(/Validade/) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled')).toBe(true);
  });

  it('recusa outro formato no cliente, antes de subir', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderModal();
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] },
    });
    expect(await screen.findByText(/Formato inválido/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recusa acima de 5 MB no cliente', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderModal();
    const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [huge] },
    });
    expect(await screen.findByText(/excede o limite de 5 MB/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('arrastar anexa o arquivo', async () => {
    renderModal();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({
        validUntil: '2026-09-29',
        confidence: 'alta',
        matchedLabel: 'Validade',
        textChars: 40,
      })),
    );
    fireEvent.drop(dropZone(), { dataTransfer: { files: [PDF] } });
    expect(await screen.findByText(/Validade encontrada no documento/)).toBeTruthy();
  });

  it('não permite duplo envio', async () => {
    let finishUpload: ((value: Response) => void) | undefined;
    const uploadPromise = new Promise<Response>((resolve) => {
      finishUpload = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input).includes('/analisar')) {
          return jsonResponse({
            validUntil: '2026-09-29',
            confidence: 'alta',
            matchedLabel: 'Validade',
            textChars: 40,
          });
        }
        return uploadPromise;
      }),
    );
    renderModal();
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [PDF] },
    });
    await screen.findByLabelText(/corrigir se estiver errada/);
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    fireEvent.click(enviar);
    fireEvent.click(enviar);
    const uploads = vi.mocked(fetch).mock.calls.filter(([url, init]) => (
      String(url).includes('/upload') && (init as RequestInit | undefined)?.method === 'POST'
    ));
    expect(uploads).toHaveLength(1);
    expect(dropZone().getAttribute('aria-disabled')).toBe('true');
    finishUpload?.(jsonResponse({ id: 'new' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
