import { describe, expect, it } from 'vitest';
import type { ProductRow } from '../../types';
import { buildProductTree, visibleTreeProductKeys } from '../product-tree';
import { allCollapseKeys, expandCollapseKeys, FULL_EXPAND_LIMIT, leafCollapseKeys } from '../product-group-visibility';

function row(partial: Partial<ProductRow> & { key: string }): ProductRow {
  return {
    description: partial.description || 'Produto',
    code: partial.code || 'REF',
    ...partial,
  } as ProductRow;
}

// Tipo Spica preenche Linha e Grupo com o mesmo nome (sameAsLine); "Sem linha"
// tem produtos sem subgrupo (loose).
const catalog: ProductRow[] = [
  row({ key: 'c1', productType: 'CARDIACA', productSubtype: 'CARDIACA', productSubgroup: 'ALEXIS' }),
  row({ key: 'c2', productType: 'CARDIACA', productSubtype: 'CARDIACA', productSubgroup: 'ALEXIS' }),
  row({ key: 'c3', productType: 'CARDIACA', productSubtype: 'CARDIACA', productSubgroup: 'CANULAS - EDWARDS' }),
  row({ key: 'o1', productType: 'ORTOPEDIA', productSubtype: 'ORTOPEDIA', productSubgroup: 'PLACAS' }),
  row({ key: 'o2', productType: 'ORTOPEDIA', productSubtype: 'JOELHO', productSubgroup: 'TIBIAL' }),
  row({ key: 'n1', productType: null, productSubtype: null, productSubgroup: null }),
];

describe('buildProductTree', () => {
  it('monta Linha > Grupo > Subgrupo preservando a ordem do servidor e os totais', () => {
    const tree = buildProductTree(catalog);
    expect(tree.map((l) => l.name)).toEqual(['CARDIACA', 'ORTOPEDIA', 'Sem linha']);
    expect(tree.map((l) => l.products.length)).toEqual([3, 2, 1]);

    const cardiaca = tree[0];
    expect(cardiaca.key).toBe('line:CARDIACA');
    expect(cardiaca.groups).toHaveLength(1);
    expect(cardiaca.groups[0].sameAsLine).toBe(true);
    expect(cardiaca.groups[0].key).toBe('group:CARDIACA|CARDIACA');
    expect(cardiaca.groups[0].subgroups.map((s) => [s.name, s.products.length])).toEqual([
      ['ALEXIS', 2],
      ['CANULAS - EDWARDS', 1],
    ]);
    expect(cardiaca.groups[0].subgroups[0].key).toBe('sub:CARDIACA|CARDIACA|ALEXIS');

    const orto = tree[1];
    expect(orto.groups.map((g) => [g.name, g.sameAsLine])).toEqual([
      ['ORTOPEDIA', true],
      ['JOELHO', false],
    ]);

    const semLinha = tree[2];
    expect(semLinha.groups[0].name).toBe('Sem grupo');
    expect(semLinha.groups[0].sameAsLine).toBe(false);
    expect(semLinha.groups[0].subgroups).toHaveLength(0);
    expect(semLinha.groups[0].loose.map((p) => p.key)).toEqual(['n1']);
  });

  it('visibleTreeProductKeys respeita linha, grupo (exceto sameAsLine) e subgrupo recolhidos', () => {
    const tree = buildProductTree(catalog);

    // Tudo recolhido: nenhum produto visível.
    expect(visibleTreeProductKeys(tree, allCollapseKeys(catalog, 'productType'))).toEqual([]);

    // Tudo aberto: todos.
    expect(visibleTreeProductKeys(tree, new Set())).toEqual(['c1', 'c2', 'c3', 'o1', 'o2', 'n1']);

    // Grupo sameAsLine na lista de recolhidos é ignorado (não há cabeçalho pra ele).
    expect(visibleTreeProductKeys(tree, new Set(['group:CARDIACA|CARDIACA']))).toContain('c1');

    // Grupo real recolhido esconde só os dele.
    const keys = visibleTreeProductKeys(tree, new Set(['group:ORTOPEDIA|JOELHO']));
    expect(keys).not.toContain('o2');
    expect(keys).toContain('o1');

    // Subgrupo recolhido esconde só os dele.
    expect(visibleTreeProductKeys(tree, new Set(['sub:CARDIACA|CARDIACA|ALEXIS']))).toEqual(['c3', 'o1', 'o2', 'n1']);
  });
});

describe('expandCollapseKeys (Expandir / busca)', () => {
  it('conjunto pequeno abre tudo', () => {
    expect(expandCollapseKeys(catalog, 'productType').size).toBe(0);
    expect(expandCollapseKeys(catalog, 'description').size).toBe(0);
  });

  it('acima de FULL_EXPAND_LIMIT abre só até o último agrupamento (não renderiza milhares de linhas)', () => {
    const big: ProductRow[] = Array.from({ length: FULL_EXPAND_LIMIT + 1 }, (_, i) =>
      row({ key: `k${i}`, productType: 'ORTOPEDIA', productSubtype: 'ORTOPEDIA', productSubgroup: i % 2 ? 'PLACAS' : 'PARAFUSOS' }),
    );
    const keys = expandCollapseKeys(big, 'productType');
    expect(keys).toEqual(leafCollapseKeys(big));
    expect(keys.has('sub:ORTOPEDIA|ORTOPEDIA|PLACAS')).toBe(true);
    expect(keys.has('line:ORTOPEDIA')).toBe(false);
    expect(visibleTreeProductKeys(buildProductTree(big), keys)).toEqual([]);
  });

  it('sem subgrupo (Spica: Tipo=Linha, SubTipo=Grupo) recolhe o grupo; grupo==linha recolhe a linha', () => {
    const big: ProductRow[] = Array.from({ length: FULL_EXPAND_LIMIT + 1 }, (_, i) =>
      row({
        key: `k${i}`,
        productType: i % 3 ? 'CARDIACA' : 'OUTROS',
        productSubtype: i % 3 ? (i % 2 ? 'ALEXIS' : 'CANULAS - EDWARDS') : 'OUTROS',
        productSubgroup: null,
      }),
    );
    const keys = expandCollapseKeys(big, 'productType');
    expect(keys.has('group:CARDIACA|ALEXIS')).toBe(true);
    expect(keys.has('group:CARDIACA|CANULAS - EDWARDS')).toBe(true);
    expect(keys.has('line:CARDIACA')).toBe(false);
    // OUTROS/OUTROS não tem cabeçalho de grupo: só recolher a linha impede as 334 linhas.
    expect(keys.has('line:OUTROS')).toBe(true);
    expect(visibleTreeProductKeys(buildProductTree(big), keys)).toEqual([]);
  });
});
