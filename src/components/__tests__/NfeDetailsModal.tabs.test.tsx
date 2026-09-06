import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import NfeDetailsModal from '../NfeDetailsModal';

// SPEC-047: o modal lê o papel do utilizador para mostrar "Relacionar".
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ role: 'editor', isAdmin: false, canWrite: true, allowedPages: [], hasPageAccess: () => true }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

/** A faixa de abas renderiza antes dos dados; o fetch vive em useEffect, que o render estático não corre. */
const html = () => renderToStaticMarkup(<NfeDetailsModal isOpen onClose={() => {}} invoiceId="x" />);
const tags = (out: string, marca: string) => out.match(new RegExp(`<[a-z]+[^>]*${marca}[^>]*>`, 'g')) ?? [];

describe('NfeDetailsModal: abas', () => {
  it('é um tablist nomeado com 8 tabs, uma seleccionada, e um tabpanel ligado a ela', () => {
    const out = html();
    const tablist = tags(out, 'role="tablist"');
    expect(tablist).toHaveLength(1);
    expect(tablist[0]).toContain('aria-label=');

    const tabs = tags(out, 'role="tab"');
    expect(tabs).toHaveLength(8);
    const seleccionadas = tabs.filter((t) => t.includes('aria-selected="true"'));
    expect(seleccionadas).toHaveLength(1);
    // SPEC-049: abertura padrão na aba Produtos
    expect(seleccionadas[0]).toContain('aria-label="Produtos"');
    expect(seleccionadas[0]).toContain('tab-produtos');
    // Só a seleccionada entra na ordem do Tab; as outras chegam pelas setas.
    expect(tabs.filter((t) => t.includes('tabindex="-1"'))).toHaveLength(7);
    for (const t of tabs) expect(t).toContain('aria-controls=');

    const idAtiva = seleccionadas[0].match(/ id="([^"]+)"/)?.[1];
    const painel = tags(out, 'role="tabpanel"');
    expect(painel).toHaveLength(1);
    expect(painel[0]).toContain(`aria-labelledby="${idAtiva}"`);

    expect(out).not.toContain('aria-pressed');
  });
});
