import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Card from '../Card';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const tag = (el: React.ReactElement) => renderToStaticMarkup(el).match(/^<[^>]+>/)?.[0] ?? '';

describe('Card', () => {
  it('é um <div> com a superfície de cartão e sem sombra em repouso', () => {
    const t = tag(<Card>x</Card>);
    expect(t).toMatch(/^<div/);
    for (const cls of ['bg-white', 'dark:bg-card-dark', 'rounded-xl', 'overflow-hidden']) expect(t).toContain(cls);
    expect(t).toMatch(/\bborder\b/);
    expect(t).not.toMatch(/\bshadow/);
    expect(t).not.toMatch(/(?<![-\w:])text-slate-400\b/);
  });

  it('padding none/sm/md/lg → vazio/p-3/p-4 sm:p-5/p-6, md por defeito', () => {
    expect(tag(<Card padding="none">x</Card>)).not.toMatch(/(?<![-\w:])p-\d/);
    expect(tag(<Card padding="sm">x</Card>)).toContain('p-3');
    expect(tag(<Card padding="md">x</Card>)).toContain('p-4 sm:p-5');
    expect(tag(<Card>x</Card>)).toContain('p-4 sm:p-5');
    expect(tag(<Card padding="lg">x</Card>)).toContain('p-6');
  });

  it('as="section" troca a tag', () => {
    const out = html(<Card as="section">x</Card>);
    expect(out).toMatch(/^<section/);
    expect(out).not.toContain('<div');
  });

  it('className extra é anexada e o filho renderiza', () => {
    const out = html(<Card className="mt-4">conteúdo</Card>);
    expect(tag(<Card className="mt-4">x</Card>)).toContain('mt-4');
    expect(out).toContain('conteúdo');
  });

  it('passa onClick, role e aria adiante (cartão clicável)', () => {
    const out = html(<Card role="button" aria-label="Abrir" onClick={() => {}}>x</Card>);
    expect(out).toContain('role="button"');
    expect(out).toContain('aria-label="Abrir"');
  });
});
