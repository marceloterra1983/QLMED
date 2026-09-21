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

  it('lista orçamento histórico no card e na tabela com origem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          quotes: [
            {
              id: 'arc1',
              numberLabel: '00008318',
              issuedAt: '2026-09-15',
              status: 'issued',
              customerName: 'IASEMT',
              total: '3800.00',
              patientName: 'LUIZ CARLOS DE ALMEIDA',
              origin: 'email',
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
        }),
      }),
    );
    render(<OrcamentosPageClient />);
    await waitFor(() => {
      expect(screen.getAllByText('00008318').length).toBeGreaterThan(0);
      expect(screen.getAllByText('LUIZ CARLOS DE ALMEIDA').length).toBeGreaterThan(0);
      expect(screen.getAllByText('E-mail').length).toBeGreaterThan(0);
    });
  });
});
