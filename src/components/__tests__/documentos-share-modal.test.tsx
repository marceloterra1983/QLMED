// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentoShareModal from '@/app/(painel)/cadastro/documentos/components/DocumentoShareModal';
import { DOCUMENTOS_SHARE_RECIPIENTS } from '@/lib/documentos/share-email';

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

const RECIPIENTS = DOCUMENTOS_SHARE_RECIPIENTS.map(({ email, label }) => ({ email, label }));

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  return {
    ok: init.ok ?? status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

function renderModal() {
  return render(
    <DocumentoShareModal
      isOpen
      onClose={vi.fn()}
      documentId="doc-federal"
      title="CND Receita Federal"
      recipients={RECIPIENTS}
    />,
  );
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DocumentoShareModal (SPEC-042 L12)', () => {
  it('lista os rótulos da allowlist e não oferece e-mail livre', () => {
    renderModal();
    for (const recipient of RECIPIENTS) {
      expect(screen.getByText(recipient.label)).toBeTruthy();
    }
    expect(screen.queryByRole('textbox', { name: /e-mail/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/e-mail/i)).toBeNull();
  });

  it('não envia com zero destinatários', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderModal();
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar.hasAttribute('disabled')).toBe(true);
    fireEvent.click(enviar);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sucesso diz para quantos foi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ sent: ['faturamento@qlmed.com.br', 'marcelo@qlmed.com.br'] })),
    );
    renderModal();
    fireEvent.click(screen.getByText('Faturamento'));
    fireEvent.click(screen.getByText('Marcelo'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Enviado para 2 destinatários');
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/documentos/doc-federal/compartilhar',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falha mostra a mensagem da rota, sem detalhe técnico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Destinatário não permitido' }, { status: 400 })),
    );
    renderModal();
    fireEvent.click(screen.getByText('Faturamento'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Destinatário não permitido');
    });
  });
});
