// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ canWrite: true, role: 'admin', isAdmin: true }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import OrcamentosPageClient from '@/app/(painel)/orcamentos/page-client';

describe('SPEC-085 — página Orçamentos', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('mostra o título e o botão de novo orçamento', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ quotes: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } }),
      }),
    );
    render(<OrcamentosPageClient />);
    expect(screen.getByRole('heading', { name: 'Orçamentos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Novo orçamento/ })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Nenhum orçamento')).toBeTruthy();
    });
  });
});
