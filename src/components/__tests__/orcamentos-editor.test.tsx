// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ canWrite: true, role: 'admin', isAdmin: true }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import OrcamentoEditor from '@/app/(painel)/orcamentos/OrcamentoEditor';

describe('SPEC-085 — editor Orçamentos', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Linha avulsa cria item sem crypto.randomUUID (HTTP Tailscale)', async () => {
    const cryptoObj = globalThis.crypto as Crypto & { randomUUID?: () => string };
    const original = cryptoObj.randomUUID;
    // Preview :3002 é HTTP; o browser não expõe randomUUID.
    Reflect.deleteProperty(cryptoObj, 'randomUUID');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ clientes: [], produtos: [] }),
      }),
    );

    try {
      render(<OrcamentoEditor />);
      expect(screen.getByRole('heading', { name: /Novo orçamento/ })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Linha avulsa' }));
      await waitFor(() => {
        expect(screen.getByLabelText('Código do item')).toBeTruthy();
      });
    } finally {
      if (original) cryptoObj.randomUUID = original;
    }
  });
});
