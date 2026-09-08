import { describe, expect, it } from 'vitest';
import { PDF_CSS } from '@/lib/pdf/pdf-css';

/** Remove @media blocks by tracking braces so nested @page inside @media print is stripped too. */
function stripMediaBlocks(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (css.startsWith('@media', i)) {
      const brace = css.indexOf('{', i);
      if (brace < 0) {
        out += css.slice(i);
        break;
      }
      let depth = 0;
      let j = brace;
      while (j < css.length) {
        if (css[j] === '{') depth += 1;
        else if (css[j] === '}') {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
        j += 1;
      }
      i = j;
      continue;
    }
    out += css[i];
    i += 1;
  }
  return out;
}

describe('DANFE FOLHA counter cascade', () => {
  it('fallback 1 de N só existe em @media screen', () => {
    expect(PDF_CSS).toMatch(/@media screen[\s\S]*folha-counter::after[\s\S]*1 de /);
    expect(stripMediaBlocks(PDF_CSS)).not.toMatch(/folha-counter::after/);
  });

  it('print usa counter(page)', () => {
    expect(PDF_CSS).toMatch(/@media print[\s\S]*folha-counter::after[\s\S]*counter\(page\)/);
  });

  it('nenhuma regra .folha-counter::after fica fora de media query', () => {
    const unscoped: string[] = [];
    let depth = 0;
    let inMedia = false;
    for (const line of PDF_CSS.split('\n')) {
      if (depth === 0 && /@media\b/.test(line)) inMedia = true;
      if (/folha-counter::after/.test(line) && !inMedia) unscoped.push(line);
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      if (depth === 0) inMedia = false;
    }
    expect(unscoped).toEqual([]);
    expect(PDF_CSS).toMatch(/@media print[\s\S]*counter\(page\)/);
    expect(PDF_CSS).toMatch(/@media screen[\s\S]*"1 de "/);
  });
});
