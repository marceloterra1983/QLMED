// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ListCount from '@/components/ui/ListCount';

describe('ListCount', () => {
  it('mostra o total quando a página carregou tudo', () => {
    render(<ListCount shown={2} total={2} noun="nota(s)" />);
    expect(screen.getByText('2 nota(s)')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('avisa truncamento só sem metadados de página (QLMED-UI-001 residual)', () => {
    render(<ListCount shown={2} total={5001} noun="nota(s)" />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('2 de 5001 nota(s)');
    expect(status.textContent).toMatch(/truncada/i);
  });

  it('em lista paginada descreve o recorte, sem fingir que o período inteiro está na tela', () => {
    render(
      <ListCount
        shown={50}
        total={1234}
        noun="nota(s)"
        page={1}
        pages={25}
        pageSize={50}
      />,
    );
    expect(screen.getByText(/1–50 de 1234 nota\(s\)/)).toBeTruthy();
    expect(screen.getByText(/página 1 de 25/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/truncada/i)).toBeNull();
  });
});
