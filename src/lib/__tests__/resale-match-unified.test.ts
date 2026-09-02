import { describe, expect, it } from 'vitest';
import {
  buildResaleIndex,
  matchResaleProduct,
  resaleIndexKeys,
  resaleLookupKeys,
} from '@/lib/product-aggregation/resale-match';
import { buildProductKey } from '@/lib/product-aggregation/units';
import type { ProductFromXml } from '@/lib/product-aggregation/units';

/**
 * FISCAL-009: incremental e rebuild casavam a linha de revenda por algoritmos
 * diferentes. Estes testes provam que agora existe um só, e medem o delta
 * entre os dois caminhos sobre a mesma fixture.
 */

interface CatalogRow {
  id: string;
  code: string | null;
  unit: string | null;
  ean: string | null;
  description: string;
  /** Estoque agregado, para medir o delta incremental vs rebuild. */
  qty: number;
}

function catalog(): CatalogRow[] {
  return [
    { id: 'p-valvula', code: 'VLV100', unit: 'UN', ean: '7891234567895', description: 'VALVULA MECANICA CORCYM 21MM', qty: 100 },
    { id: 'p-anel', code: 'ANL-200', unit: 'UN', ean: null, description: 'ANEL PARA ANULOPLASTIA 28MM', qty: 50 },
    { id: 'p-sem-codigo', code: null, unit: 'CX', ean: '7899999999994', description: 'KIT CIRURGICO DESCARTAVEL', qty: 30 },
  ];
}

function line(over: Partial<ProductFromXml>): ProductFromXml {
  return {
    code: '',
    description: '',
    ncm: '90211010',
    unit: 'UN',
    quantity: 1,
    unitPrice: 10,
    totalValue: 10,
    ean: null,
    anvisa: null,
    batches: [],
    ...over,
  } as ProductFromXml;
}

/** Linhas de venda de revenda, cada uma casando por um caminho diferente. */
function resaleLines(): ProductFromXml[] {
  return [
    // casa por código + unidade
    line({ code: 'VLV100', unit: 'UN', description: 'VALVULA MECANICA CORCYM 21MM', quantity: 5, totalValue: 50 }),
    // sem cProd útil: casa pelo EAN
    line({ code: '-', unit: 'CX', ean: '7899999999994', description: 'KIT DESCARTAVEL OUTRO NOME', quantity: 3, totalValue: 30 }),
    // sem código e sem EAN: casa por descrição + unidade
    line({ code: '', unit: 'UN', ean: null, description: 'ANEL PARA ANULOPLASTIA 28MM', quantity: 2, totalValue: 20 }),
    // código do fabricante no início da descrição, não no cProd
    line({ code: '', unit: 'UN', ean: null, description: 'VLV100 VALVULA REEMBALADA', quantity: 1, totalValue: 10 }),
  ];
}

describe('resale-match — uma função só', () => {
  it('as chaves de índice e de sonda batem para o mesmo produto', () => {
    const row = catalog()[0];

    // Tudo que o catálogo publica, a sonda procura.
    expect(resaleLookupKeys(row)).toEqual(expect.arrayContaining(resaleIndexKeys(row)));
  });

  it('sonda na ordem código → código-na-descrição → EAN → descrição', () => {
    const keys = resaleLookupKeys({
      code: 'ABC',
      unit: 'UN',
      ean: '7891234567895',
      description: 'XYZ PRODUTO TESTE',
    });

    expect(keys).toEqual([
      'R_CODE_UNIT:ABC::UN',
      'R_CODE_UNIT:XYZ::UN',
      'R_EAN:7891234567895',
      'R_DESC_UNIT:xyz produto teste::UN',
    ]);
  });

  it('não casa nada quando não há token nenhum em comum', () => {
    const index = buildResaleIndex(catalog(), (r) => r);

    expect(matchResaleProduct(index, line({ code: 'NAO-EXISTE', unit: 'UN', description: 'OUTRA COISA' }))).toBeNull();
  });
});

describe('incremental ≡ rebuild sobre a mesma fixture', () => {
  /** Rebuild: monta o índice do mapa em memória e deduz. */
  function rebuild(): Map<string, number> {
    const rows = catalog();
    const index = buildResaleIndex(rows, (r) => r);
    for (const product of resaleLines()) {
      const hit = matchResaleProduct(index, product);
      if (hit) hit.qty -= product.quantity;
    }
    return new Map(rows.map((r) => [r.id, r.qty]));
  }

  /** Incremental: mesma função, mas nota a nota, contra o "catálogo do banco". */
  function incremental(): Map<string, number> {
    const rows = catalog();
    for (const product of resaleLines()) {
      // O índice é recarregado por nota, como acontece em loadResaleIndex.
      const index = buildResaleIndex(rows, (r) => r);
      const hit = matchResaleProduct(index, product);
      if (hit) hit.qty -= product.quantity;
    }
    return new Map(rows.map((r) => [r.id, r.qty]));
  }

  it('delta = 0 entre os dois caminhos', () => {
    const a = incremental();
    const b = rebuild();

    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    for (const [id, qty] of a) expect(qty - b.get(id)!).toBe(0);
  });

  it('as quatro linhas foram deduzidas, nenhuma ignorada', () => {
    const result = incremental();

    expect(result.get('p-valvula')).toBe(100 - 5 - 1);
    expect(result.get('p-anel')).toBe(50 - 2);
    expect(result.get('p-sem-codigo')).toBe(30 - 3);
  });

  it('o matching exato antigo ignorava as linhas que só casam por descrição ou pelo código na descrição', () => {
    // Controlo do defeito: `buildProductKey` devolve UMA chave por linha. A
    // linha do ANEL (só casa por descrição) e a da VALVULA REEMBALADA (código
    // do fabricante na descrição) não batem com a productKey do catálogo —
    // eram deduzidas no rebuild e ignoradas no incremental.
    const registryKeys = new Set(
      catalog().map((r) =>
        buildProductKey(line({ code: r.code ?? '', unit: r.unit ?? '', ean: r.ean, description: r.description })),
      ),
    );
    const ignoradasPeloAlgoritmoAntigo = resaleLines().filter(
      (p) => !registryKeys.has(buildProductKey(p)),
    );

    expect(ignoradasPeloAlgoritmoAntigo).toHaveLength(2);

    // E o algoritmo unificado casa todas.
    const index = buildResaleIndex(catalog(), (r) => r);
    for (const p of ignoradasPeloAlgoritmoAntigo) {
      expect(matchResaleProduct(index, p)).not.toBeNull();
    }
  });
});
