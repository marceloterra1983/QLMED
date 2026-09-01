import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Modal from '../Modal';

// next/link puxa o runtime do router; aqui só interessa o <a> que ele emite.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * O trap de foco vive em `useEffect`, que não corre no render estático —
 * o comportamento está provado em `lib/__tests__/focus-trap.test.ts`; aqui
 * verifica-se a fiação pela estrutura do HTML.
 */
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const aberto = (props: Partial<React.ComponentProps<typeof Modal>> = {}) => (
  <Modal isOpen onClose={() => {}} title="Título do diálogo" {...props}>
    <p>corpo</p>
  </Modal>
);

/**
 * Só a tag de abertura do elemento pedido. `toContain('sm:flex-row')` sobre o
 * HTML inteiro casaria com qualquer filho; a tag isola o shell.
 */
const tagCom = (out: string, marca: string) =>
  out.match(new RegExp(`<div[^>]*${marca}[^>]*>`))?.[0] ?? '';
const shell = (out: string) => tagCom(out, 'role="dialog"');
const corpo = (out: string) => tagCom(out, 'overflow-y-auto');

describe('Modal', () => {
  it('fechado não renderiza nada', () => {
    expect(html(aberto({ isOpen: false }))).toBe('');
  });

  it('é um dialog modal nomeado por um <h2> com o título', () => {
    const out = html(aberto());
    const tag = shell(out);
    expect(tag).toContain('role="dialog"');
    expect(tag).toContain('aria-modal="true"');
    const id = tag.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    const h2s = [...out.matchAll(/<h2\b([^>]*)>([^<]*)<\/h2>/g)];
    const nomeador = h2s.find((m) => m[1].includes(`id="${id}"`));
    expect(nomeador?.[2]).toBe('Título do diálogo');
  });

  it('header próprio substitui a linha de título, mas o nome acessível fica em sr-only', () => {
    const out = html(aberto({ header: <div data-x="h">Cabeçalho próprio</div> }));
    expect(out).toContain('data-x="h"');
    expect(out).toMatch(/<h2\b[^>]*class="sr-only"[^>]*>Título do diálogo<\/h2>/);
    expect(out).not.toContain('aria-label="Fechar diálogo"');
  });

  it('sem header, o botão de fechar tem nome e o ícone é decorativo', () => {
    const out = html(aberto());
    const fechar = out.match(/<button\b[^>]*aria-label="Fechar diálogo"[^>]*>([\s\S]*?)<\/button>/);
    expect(fechar).not.toBeNull();
    expect(fechar?.[1]).toContain('aria-hidden="true"');
    expect(fechar?.[1]).toContain('close');
  });

  it('surface troca fundo escuro e raio do shell', () => {
    const sunken = shell(html(aberto({ surface: 'sunken' })));
    expect(sunken).toContain('dark:bg-surface-sunken');
    expect(sunken).toContain('sm:rounded-2xl');
    expect(sunken).not.toContain('dark:bg-card-dark');

    const card = shell(html(aberto()));
    expect(card).toContain('dark:bg-card-dark');
    expect(card).toMatch(/[\s"]sm:rounded-xl[\s"]/);
    expect(card).not.toContain('dark:bg-surface-sunken');
  });

  it('direction="row" põe cabeçalho e corpo lado a lado no desktop', () => {
    expect(shell(html(aberto({ direction: 'row' })))).toContain('sm:flex-row');
    expect(shell(html(aberto()))).not.toContain('sm:flex-row');
  });

  it('footer: omitido mostra "Voltar" no celular, null remove, próprio substitui', () => {
    expect(html(aberto())).toContain('Voltar');
    expect(html(aberto({ footer: null }))).not.toContain('Voltar');
    const proprio = html(aberto({ footer: <div data-x="f" /> }));
    expect(proprio).toContain('data-x="f"');
    expect(proprio).not.toContain('Voltar');
  });

  it('bodyClassName substitui o p-6 do corpo', () => {
    expect(corpo(html(aberto()))).toMatch(/[\s"]p-6[\s"]/);
    const custom = corpo(html(aberto({ bodyClassName: 'p-0 grid' })));
    expect(custom).toContain('p-0 grid');
    expect(custom).not.toMatch(/[\s"]p-6[\s"]/);
  });

  it('width e height chegam ao shell', () => {
    const tag = shell(html(aberto({ width: 'sm:max-w-md', height: 'sm:h-[80vh]' })));
    expect(tag).toContain('sm:max-w-md');
    expect(tag).toContain('sm:h-[80vh]');
  });

  it('não sobrepõe o contorno de foco global com focus:ring', () => {
    expect(html(aberto({ subtitle: 'Sub' }))).not.toContain('focus:ring');
  });

  it('nenhum text-primary sem dark:text-blue-400 no mesmo literal de classe', () => {
    // 2,91:1 sobre card-dark — só passa se o literal também trouxer a cor do escuro.
    const out = html(aberto({ subtitle: 'Sub' }));
    expect(out).not.toMatch(/class="(?![^"]*dark:text-blue-400)[^"]*\btext-primary/);
  });
});
