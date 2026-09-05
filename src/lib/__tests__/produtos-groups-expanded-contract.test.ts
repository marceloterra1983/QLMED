import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageClient = readFileSync(
  join(process.cwd(), 'src/app/(painel)/cadastro/produtos/page-client.tsx'),
  'utf8',
);

const productTable = readFileSync(
  join(process.cwd(), 'src/app/(painel)/cadastro/produtos/components/ProductTable.tsx'),
  'utf8',
);

const visibility = readFileSync(
  join(process.cwd(), 'src/app/(painel)/cadastro/produtos/components/product-group-visibility.ts'),
  'utf8',
);

describe('produtos groups collapsed-by-default contract', () => {
  it('colapsa todos os grupos após fetch bem-sucedido', () => {
    const fetchIdx = pageClient.indexOf('setMeta(data.meta || null)');
    expect(fetchIdx).toBeGreaterThan(0);
    const afterFetch = pageClient.slice(fetchIdx, fetchIdx + 320);
    expect(afterFetch).toContain('allCollapseKeys');
    expect(afterFetch).toContain('allCollapseKeys(data.products');
    expect(afterFetch).toContain('debouncedSearch.trim()');
  });

  it('nao reaplica auto-collapse por sort/filteredLen', () => {
    expect(pageClient).not.toMatch(/setCollapsedGroups\(groups\)/);
    expect(pageClient).not.toContain('filteredLen');
  });

  it('default de status lista todos os produtos do cadastro (Spica)', () => {
    expect(pageClient).toMatch(
      /useState<'active' \| 'outOfLine' \| 'all'>\('all'\)/,
    );
  });

  it('ProductTable nao força expandir via blank-page guard', () => {
    expect(productTable).not.toContain('effectiveCollapsedGroups');
    expect(productTable).not.toContain('useLayoutEffect');
    expect(productTable).toContain('safeCollapseKeys');
    expect(visibility).toContain('allCollapseKeys');
  });

  it('toggleGroup nao recolhe grupos filhos ao expandir linha', () => {
    expect(pageClient).not.toMatch(/n\.add\(`group:\$\{lineName\}/);
  });

  it('default sort e hierarquia Linha/Grupo/Subgrupo (productType)', () => {
    expect(pageClient).toMatch(/useState<SortField>\('productType'\)/);
    expect(productTable).toContain('FLAT_SORTS');
  });

  it('lista usa hierarchyCounts da API e total do cadastro (nao so a pagina)', () => {
    expect(pageClient).toContain('setHierarchyCounts');
    expect(pageClient).toContain('hierarchyCounts={hierarchyCounts}');
    expect(pageClient).toContain('catalogTotal={pagination.total}');
    expect(pageClient).toMatch(/produtos no cadastro/);
    const listRoute = readFileSync(
      join(process.cwd(), 'src/app/api/products/list/route.ts'),
      'utf8',
    );
    expect(listRoute).toContain('hierarchyCounts');
    expect(listRoute).toContain('bySubgroup');
    expect(listRoute).toContain("by: ['productType']");
    const schema = readFileSync(
      join(process.cwd(), 'src/lib/schemas/product.ts'),
      'utf8',
    );
    expect(schema).toMatch(/lineStatus: z\.enum\(\['active', 'outOfLine', 'all'\]\)\.optional\(\)\.default\('all'\)/);
  });
});
