import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SortableTh, { type SortDirection } from '../SortableTh';

const noop = () => {};

// Um <th> solto não é HTML válido para o React: embrulha em tabela.
const html = (props: Partial<React.ComponentProps<typeof SortableTh>> = {}) =>
  renderToStaticMarkup(
    <table>
      <thead>
        <tr>
          <SortableTh col="nome" sortBy="nome" sortOrder="asc" onSort={noop} {...props}>
            Nome
          </SortableTh>
        </tr>
      </thead>
    </table>,
  );

// Só a tag de abertura do <th>, para não casar `aria-sort` por acidente noutro sítio.
const th = (props?: Partial<React.ComponentProps<typeof SortableTh>>) =>
  html(props).match(/<th[\s>][^>]*>/)?.[0] ?? '';
const button = (props?: Partial<React.ComponentProps<typeof SortableTh>>) =>
  html(props).match(/<button[^>]*>/)?.[0] ?? '';

describe('SortableTh', () => {
  it('é <th scope="col"> com um <button type="button"> dentro', () => {
    const out = html();
    expect(th()).toContain('scope="col"');
    expect(out).toMatch(/<th[^>]*>\s*<button[^>]*type="button"/);
    expect(out).toContain('Nome');
  });

  it('aria-sort segue a direção na coluna ativa e some na inativa', () => {
    expect(th({ sortOrder: 'asc' })).toContain('aria-sort="ascending"');
    expect(th({ sortOrder: 'desc' })).toContain('aria-sort="descending"');
    expect(th({ sortBy: 'outra' })).not.toMatch(/\saria-sort(=|\s|>)/);
  });

  it('glifo: seta na ativa, unfold_more na inativa, todos decorativos', () => {
    const casos: [Partial<{ sortBy: string; sortOrder: SortDirection }>, string][] = [
      [{ sortOrder: 'asc' }, 'arrow_upward'],
      [{ sortOrder: 'desc' }, 'arrow_downward'],
      [{ sortBy: 'outra' }, 'unfold_more'],
    ];
    for (const [props, glifo] of casos) {
      const out = html(props);
      expect(out, glifo).toMatch(new RegExp(`<span[^>]*aria-hidden="true"[^>]*>${glifo}</span>`));
      for (const outro of ['arrow_upward', 'arrow_downward', 'unfold_more']) {
        if (outro !== glifo) expect(out, `${glifo} sem ${outro}`).not.toContain(outro);
      }
    }
  });

  it('align="right" alinha o <th> e o botão', () => {
    expect(th({ align: 'right' })).toContain('text-right');
    expect(button({ align: 'right' })).toContain('justify-end');
    expect(th()).toContain('text-left');
    expect(button()).toContain('justify-start');
  });

  it('className extra é anexada ao <th>', () => {
    expect(th({ className: 'w-32' })).toContain('w-32');
  });

  it('nenhum text-primary sem dark:text-blue-400', () => {
    for (const out of [html(), html({ sortBy: 'outra' })]) {
      for (const m of out.matchAll(/class="([^"]*)"/g)) {
        if (/\btext-primary(?!-)/.test(m[1])) expect(m[1]).toContain('dark:text-blue-400');
      }
    }
  });
});
