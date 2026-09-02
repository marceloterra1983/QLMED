import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EmptyState from '../EmptyState';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const raiz = (el: React.ReactElement) => html(el).match(/^<[^>]+>/)?.[0] ?? '';
const classes = (out: string) => [...out.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));

describe('EmptyState', () => {
  const base = <EmptyState icon="inbox" title="Nenhum item" />;

  it('anuncia-se como status', () => {
    expect(raiz(base)).toMatch(/^<div[^>]*\srole="status"/);
  });

  it('o ícone é um glifo Material dentro de um disco decorativo', () => {
    const out = html(base);
    expect(out).toMatch(/<span aria-hidden="true" class="[^"]*\brounded-full\b[^"]*"><span class="material-symbols-outlined[^"]*">inbox<\/span>/);
  });

  it('o título vem em negrito', () => {
    expect(html(base)).toMatch(/<p class="[^"]*\bfont-bold\b[^"]*"[^>]*>Nenhum item<\/p>/);
  });

  it('hint aparece quando dada e o <p> de dica não existe quando omitida', () => {
    const com = html(<EmptyState icon="inbox" title="t" hint="Amplie o intervalo" />);
    expect(com).toMatch(/<p class="max-w-xs[^"]*">Amplie o intervalo<\/p>/);
    expect(html(base)).not.toContain('max-w-xs');
  });

  it('action renderiza dentro do <div class="mt-1">', () => {
    const com = html(<EmptyState icon="inbox" title="t" action={<button>Limpar</button>} />);
    expect(com).toContain('<div class="mt-1"><button>Limpar</button></div>');
    expect(html(base)).not.toContain('mt-1');
  });

  it('compact encolhe o padding, o disco e o glifo; o normal fica maior', () => {
    const normal = classes(html(base));
    const compact = classes(html(<EmptyState icon="inbox" title="t" compact />));
    for (const c of ['py-10', 'w-13', 'h-13', 'text-[26px]']) {
      expect(normal, c).toContain(c);
      expect(compact, c).not.toContain(c);
    }
    for (const c of ['py-6', 'w-10', 'h-10', 'text-[20px]']) {
      expect(compact, c).toContain(c);
      expect(normal, c).not.toContain(c);
    }
  });

  it('className extra vai para a raiz', () => {
    expect(raiz(<EmptyState icon="inbox" title="t" className="h-full" />)).toContain('h-full');
  });

  it('nenhum text-slate-400 em posição clara', () => {
    const out = html(<EmptyState icon="inbox" title="t" hint="h" />);
    expect(out).not.toMatch(/(?<![-\w:])text-slate-400\b/);
    expect(out).toContain('dark:text-slate-400');
  });
});
