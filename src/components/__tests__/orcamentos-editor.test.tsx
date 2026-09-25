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

  it('adiciona o produto escolhido e fecha a lista', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          produtos: [{
            id: 'p1',
            code: '4326202',
            description: 'KIT AUTOTRANSFUSÃO',
            ncm: '90183929',
            unit: 'UN',
            rvs: '80102511537',
            unitPrice: '3800.00',
          }],
        }),
      }),
    );
    render(<OrcamentoEditor />);
    expect(screen.queryByText('KIT AUTOTRANSFUSÃO')).toBeNull();
    fireEvent.focus(screen.getByPlaceholderText(/Código, descrição/));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /KIT AUTOTRANSFUSÃO/ })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /KIT AUTOTRANSFUSÃO/ }));
    await waitFor(() => {
      const code = screen.getByLabelText('Código do item') as HTMLInputElement;
      expect(code.value).toBe('4326202');
    });
    expect(screen.queryByRole('button', { name: /KIT AUTOTRANSFUSÃO/ })).toBeNull();
  });
});
