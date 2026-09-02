import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Spinner from '../Spinner';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const tag = (el: React.ReactElement) => renderToStaticMarkup(el).match(/^<[^>]+>/)?.[0] ?? '';

describe('Spinner', () => {
  it('anuncia role="status" com "Carregando" por defeito e o label passado', () => {
    const t = tag(<Spinner />);
    expect(t).toContain('role="status"');
    expect(t).toContain('aria-label="Carregando"');
    expect(tag(<Spinner label="Enviando" />)).toContain('aria-label="Enviando"');
  });

  it('o glifo gira e é decorativo', () => {
    const out = html(<Spinner />);
    expect(out).toContain('progress_activity');
    expect(out).toContain('animate-spin');
    expect(out).toMatch(/<span aria-hidden="true"[^>]*animate-spin/);
  });

  it('sm/md/lg → 16/24/32px, md por defeito', () => {
    expect(html(<Spinner size="sm" />)).toContain('text-[16px]');
    expect(html(<Spinner size="md" />)).toContain('text-[24px]');
    expect(html(<Spinner />)).toContain('text-[24px]');
    expect(html(<Spinner size="lg" />)).toContain('text-[32px]');
  });

  it('cor pareada claro/escuro', () => {
    const out = html(<Spinner />);
    expect(out).toContain('text-slate-500');
    expect(out).toContain('dark:text-slate-400');
  });
});
