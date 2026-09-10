// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentoWhatsAppModal from '@/app/(painel)/cadastro/documentos/components/DocumentoWhatsAppModal';
import { DOCUMENTOS_WHATSAPP_RECIPIENTS } from '@/lib/documentos/share-whatsapp';

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

const RECIPIENTS = DOCUMENTOS_WHATSAPP_RECIPIENTS.map(({ phone, label }) => ({ phone, label }));

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  return {
    ok: init.ok ?? status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

function renderModal(props: Partial<{ onClose: () => void }> = {}) {
  return render(
    <DocumentoWhatsAppModal
      isOpen
      onClose={props.onClose ?? vi.fn()}
      documentId="doc-1"
      title="CND"
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

describe('DocumentoWhatsAppModal (SPEC-042 FR-043)', () => {
  it('lista os rótulos pré-cadastrados e oferece Outro número', () => {
    renderModal();
    for (const recipient of RECIPIENTS) {
      expect(screen.getByText(recipient.label)).toBeTruthy();
    }
    expect(screen.getByRole('textbox', { name: /outro número/i })).toBeTruthy();
  });

  it('não envia sem destinatário', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderModal();
    const enviar = screen.getByRole('button', { name: 'Enviar pelo WhatsApp' });
    expect(enviar.hasAttribute('disabled')).toBe(true);
    fireEvent.click(enviar);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia allowlist selecionada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ sent: ['556791908000'] })),
    );
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText('Marcelo'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pelo WhatsApp' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Enviado para 1 destinatário no WhatsApp');
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/documentos/doc-1/compartilhar-whatsapp',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phones: [RECIPIENTS[0].phone] }),
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('envia só o número livre', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ sent: ['5567999999999'] })),
    );
    renderModal();
    fireEvent.change(screen.getByRole('textbox', { name: /outro número/i }), {
      target: { value: '67 99999-9999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pelo WhatsApp' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Enviado para 1 destinatário no WhatsApp');
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/documentos/doc-1/compartilhar-whatsapp',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phones: ['67 99999-9999'] }),
      }),
    );
  });
});
