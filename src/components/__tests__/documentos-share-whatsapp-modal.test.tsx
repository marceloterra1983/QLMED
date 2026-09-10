// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentoWhatsAppModal from '@/app/(painel)/cadastro/documentos/components/DocumentoWhatsAppModal';

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

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DocumentoWhatsAppModal (SPEC-042 L15)', () => {
  it('não envia com telefone curto', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <DocumentoWhatsAppModal isOpen onClose={vi.fn()} documentId="doc-1" title="CND" />,
    );
    const enviar = screen.getByRole('button', { name: 'Enviar pelo WhatsApp' });
    expect(enviar.hasAttribute('disabled')).toBe(true);
    fireEvent.click(enviar);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia telefone e fecha com sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ sent: '5567999999999' })));
    const onClose = vi.fn();
    render(
      <DocumentoWhatsAppModal isOpen onClose={onClose} documentId="doc-1" title="CND" />,
    );
    fireEvent.change(screen.getByPlaceholderText('67 99999-9999'), {
      target: { value: '67 99999-9999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pelo WhatsApp' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Enviado pelo WhatsApp');
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/documentos/doc-1/compartilhar-whatsapp',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '67 99999-9999' }),
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
