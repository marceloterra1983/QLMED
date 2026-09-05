// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import RowActions, { RowActionsBase } from '@/components/ui/RowActions';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function inlineIcons(container: HTMLElement): string[] {
  const root = container.querySelector('.flex.items-center') as HTMLElement;
  return [...root.querySelectorAll(':scope > button')].map(
    (btn) => btn.querySelector('.material-symbols-outlined')?.textContent ?? '',
  );
}

function menuRoot(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.z-50');
}

function menuLabels(container: HTMLElement): string[] {
  const menu = menuRoot(container);
  if (!menu) return [];
  return [...menu.querySelectorAll('button')].map((btn) => btn.getAttribute('aria-label') ?? '');
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));
}

function renderInvoice(overrides: Partial<ComponentProps<typeof RowActions>> = {}) {
  const onView = overrides.onView ?? vi.fn();
  const onDetails = overrides.onDetails ?? vi.fn();
  const view = render(
    <RowActions invoiceId="inv-1" onView={onView} onDetails={onDetails} {...overrides} />,
  );
  return { ...view, onView, onDetails };
}

describe('RowActions — contrato de nota fiscal', () => {
  it('ícones inline: receipt_long e print; search só com onViewProducts', () => {
    const { container, rerender, onView, onDetails } = renderInvoice();
    expect(inlineIcons(container)).toEqual(['receipt_long', 'print']);
    expect(inlineIcons(container)).toContain('print');
    expect(inlineIcons(container)).not.toContain('search');
    expect(inlineIcons(container)).not.toContain('more_vert');

    const printBtn = screen.getByRole('button', { name: 'Imprimir' });
    expect(printBtn.className).toContain('hidden');
    expect(printBtn.className).toContain('sm:flex');

    rerender(
      <RowActions invoiceId="inv-1" onView={onView} onDetails={onDetails} onViewProducts={vi.fn()} />,
    );
    expect(inlineIcons(container)).toEqual(['receipt_long', 'search', 'print']);
  });

  it('menu mínimo: Detalhes, Imprimir, Salvar XML, Salvar PDF', () => {
    const { container } = renderInvoice();
    openMenu();
    expect(menuLabels(container)).toEqual(['Detalhes', 'Imprimir', 'Salvar XML', 'Salvar PDF']);
    expect(menuLabels(container)).not.toContain('Copiar Chave');
    expect(menuLabels(container)).not.toContain('Excluir');
  });

  it('Copiar Chave só aparece com accessKey', () => {
    const { container } = renderInvoice();
    openMenu();
    expect(menuLabels(container)).not.toContain('Copiar Chave');

    cleanup();
    const again = renderInvoice({ accessKey: '3519CHAVE' });
    openMenu();
    expect(menuLabels(again.container)).toContain('Copiar Chave');
    expect(menuLabels(again.container)).toEqual([
      'Detalhes',
      'Copiar Chave',
      'Imprimir',
      'Salvar XML',
      'Salvar PDF',
    ]);
  });

  it('Excluir só aparece com onDelete, é o último e tem o divisor', () => {
    const onDelete = vi.fn();
    const { container } = renderInvoice({ onDelete, accessKey: '3519CHAVE' });
    openMenu();
    const labels = menuLabels(container);
    expect(labels).toContain('Excluir');
    expect(labels.at(-1)).toBe('Excluir');
    expect(labels).toEqual([
      'Detalhes',
      'Copiar Chave',
      'Imprimir',
      'Salvar XML',
      'Salvar PDF',
      'Excluir',
    ]);

    const excluir = screen.getByRole('button', { name: 'Excluir' });
    expect(excluir.parentElement?.querySelector('.h-px')).not.toBeNull();
    expect(excluir.className).toContain('text-red-500');

    const detalhes = screen.getByRole('button', { name: 'Detalhes' });
    expect(detalhes.parentElement?.querySelector('.h-px')).toBeNull();
  });

  it('repassa os callbacks da nota fiscal e fecha o menu ao escolher', () => {
    const onView = vi.fn();
    const onDetails = vi.fn();
    const onViewProducts = vi.fn();
    const onDelete = vi.fn();
    renderInvoice({ onView, onDetails, onViewProducts, onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Visualizar documento' }));
    expect(onView).toHaveBeenCalledWith('inv-1');

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
    expect(onViewProducts).toHaveBeenCalledWith('inv-1');

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    expect(onDetails).toHaveBeenCalledWith('inv-1');
    expect(screen.queryByRole('button', { name: 'Detalhes' })).toBeNull();

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onDelete).toHaveBeenCalledWith('inv-1');
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
  });
});

describe('RowActionsBase — dirigido por dados', () => {
  it('desenha as ações que recebeu', () => {
    const onAbrir = vi.fn();
    const onBaixar = vi.fn();
    const onShare = vi.fn();
    const onRemover = vi.fn();
    const { container } = render(
      <RowActionsBase
        inline={[
          { label: 'Abrir', icon: 'folder_open', onSelect: onAbrir },
          { label: 'Baixar', icon: 'download', onSelect: onBaixar, hideOnMobile: true },
        ]}
        menu={[
          { label: 'Compartilhar', icon: 'share', onSelect: onShare },
          { label: 'Remover', icon: 'delete', onSelect: onRemover, danger: true },
        ]}
      />,
    );

    expect(inlineIcons(container)).toEqual(['folder_open', 'download']);
    expect(screen.getByRole('button', { name: 'Abrir' })).not.toBeNull();
    const baixar = screen.getByRole('button', { name: 'Baixar' });
    expect(baixar.className).toContain('hidden');
    expect(baixar.className).toContain('sm:flex');

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(onAbrir).toHaveBeenCalledTimes(1);

    openMenu();
    expect(menuLabels(container)).toEqual(['Compartilhar', 'Remover']);
    const remover = screen.getByRole('button', { name: 'Remover' });
    expect(remover.parentElement?.querySelector('.h-px')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Mais opções' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Mais opções' }).getAttribute('aria-haspopup')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();
  });
});

describe('fecho do menu', () => {
  it('clicar fora fecha o menu', () => {
    render(
      <div>
        <button type="button">fora</button>
        <RowActions invoiceId="inv-1" onView={vi.fn()} onDetails={vi.fn()} />
      </div>,
    );
    openMenu();
    expect(screen.getByRole('button', { name: 'Detalhes' })).not.toBeNull();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'fora' }));
    expect(screen.queryByRole('button', { name: 'Detalhes' })).toBeNull();
  });

  it('Escape fecha o menu', () => {
    renderInvoice();
    openMenu();
    expect(screen.getByRole('button', { name: 'Detalhes' })).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Detalhes' })).toBeNull();
  });
});

describe('modo compact é opt-in — as 5 páginas fiscais não podem encolher por acidente', () => {
  /**
   * `compact` existe só para a tabela de Documentos, onde a altura da linha
   * importa. As páginas fiscais (issued, invoices, cte, nfse-recebidas e
   * InvoiceListSection) usam o invólucro de nota fiscal e têm de continuar
   * exatamente como estavam. Sem este teste, trocar o valor por omissão
   * mudaria as cinco de uma vez sem nada reprovar.
   */
  it('o invólucro de nota fiscal renderiza no tamanho normal', () => {
    render(<RowActions invoiceId="inv-1" onView={vi.fn()} onDetails={vi.fn()} />);
    const botao = screen.getAllByRole('button')[0];
    expect(botao.className).toMatch(/\bp-1\.5\b/);
    expect(botao.className).not.toMatch(/sm:p-1\b/);
    const glifo = botao.querySelector('.material-symbols-outlined')!;
    expect(glifo.className).toMatch(/text-\[18px\]/);
    expect(glifo.className).not.toMatch(/sm:text-\[16px\]/);
  });

  it('RowActionsBase com compact encolhe apenas no desktop', () => {
    const acao = { label: 'Ver', icon: 'receipt_long', onSelect: vi.fn() };
    render(<RowActionsBase inline={[acao]} menu={[{ ...acao, label: 'Baixar', icon: 'download' }]} compact />);
    const botao = screen.getAllByRole('button')[0];
    expect(botao.className).toMatch(/sm:p-1\b/);
    // no telemóvel o alvo de toque fica como estava
    expect(botao.className).toMatch(/\bp-1\.5\b/);
  });
});
