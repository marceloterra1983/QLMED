import { describe, expect, it } from 'vitest';
import { allocateLotQuantities, extractProductsFromXml } from '@/lib/product-aggregation';

describe('allocateLotQuantities', () => {
  it('reparte igualmente e o último fecha a soma', () => {
    const lots = [
      { quantity: null as number | null },
      { quantity: null },
      { quantity: null },
    ];
    allocateLotQuantities(lots, 10);
    expect(lots.map((l) => l.quantity)).toEqual([3, 3, 4]);
  });

  it('qCom menor que o número de lotes escreve 0 nos primeiros, não null', () => {
    const lots = [
      { quantity: null as number | null },
      { quantity: null },
      { quantity: null },
    ];
    allocateLotQuantities(lots, 1);
    expect(lots.map((l) => l.quantity)).toEqual([0, 0, 1]);
  });

  it('misto: respeita qLote explícito e reparte o resto', () => {
    const lots = [
      { quantity: 4 as number | null },
      { quantity: null },
      { quantity: null },
    ];
    allocateLotQuantities(lots, 10);
    expect(lots.map((l) => l.quantity)).toEqual([4, 3, 3]);
  });

  it('qCom fracionário reparte em partes iguais (kg/L), não floor para 0', () => {
    const lots = [
      { quantity: null as number | null },
      { quantity: null },
    ];
    allocateLotQuantities(lots, 1.5);
    expect(lots.map((l) => l.quantity)).toEqual([0.75, 0.75]);
  });

  it('misto com resto <= 0 zera os lotes sem quantidade', () => {
    const lots = [
      { quantity: 10 as number | null },
      { quantity: null },
    ];
    allocateLotQuantities(lots, 10);
    expect(lots.map((l) => l.quantity)).toEqual([10, 0]);
  });
});

describe('extractProductsFromXml — múltiplos lotes sem qLote', () => {
  const xml = `<nfeProc>
    <NFe><infNFe>
      <det nItem="1">
        <prod cProd="A1" qCom="10" vProd="100"><xProd>Item</xProd>
          <med><nLote>L1</nLote></med>
          <med><nLote>L2</nLote></med>
          <med><nLote>L3</nLote></med>
        </prod>
      </det>
    </infNFe></NFe>
  </nfeProc>`;

  it('reparte a quantidade do item igualmente pelos lotes (soma exata)', async () => {
    const products = await extractProductsFromXml(xml);
    expect(products).toHaveLength(1);
    const prod = products[0];
    expect(prod.batches).toHaveLength(3);
    const sum = prod.batches.reduce((acc, b) => acc + (b.quantity ?? 0), 0);
    expect(sum).toBe(prod.quantity);
    expect(prod.batches.map((b) => b.quantity)).toEqual([3, 3, 4]);
  });

  it('lote único recebe o total do item', async () => {
    const single = `<nfeProc>
      <NFe><infNFe>
        <det nItem="1">
          <prod cProd="A1" qCom="10"><xProd>Item</xProd>
            <med><nLote>L1</nLote></med>
          </prod>
        </det>
      </infNFe></NFe>
    </nfeProc>`;
    const products = await extractProductsFromXml(single);
    expect(products[0].batches).toHaveLength(1);
    expect(products[0].batches[0].quantity).toBe(products[0].quantity);
  });

  it('lotes com qLote explícito mantêm os valores', async () => {
    const withQlote = `<nfeProc>
      <NFe><infNFe>
        <det nItem="1">
          <prod cProd="A1" qCom="10"><xProd>X</xProd>
            <rastro><nLote>1</nLote><qLote>4</qLote></rastro>
            <rastro><nLote>2</nLote><qLote>6</qLote></rastro>
          </prod>
        </det>
      </infNFe></NFe>
    </nfeProc>`;
    const products = await extractProductsFromXml(withQlote);
    expect(products[0].batches.map((b) => b.quantity)).toEqual([4, 6]);
  });

  it('rastro misto: qLote explícito + lote sem qLote reparte o resto', async () => {
    const mixed = `<nfeProc>
      <NFe><infNFe>
        <det nItem="1">
          <prod cProd="A1" qCom="10"><xProd>X</xProd>
            <rastro><nLote>1</nLote><qLote>4</qLote></rastro>
            <rastro><nLote>2</nLote></rastro>
          </prod>
        </det>
      </infNFe></NFe>
    </nfeProc>`;
    const products = await extractProductsFromXml(mixed);
    expect(products[0].batches.map((b) => b.quantity)).toEqual([4, 6]);
  });

  it('qCom 1 com 3 lotes não deixa quantity null', async () => {
    const xmlOne = `<nfeProc>
      <NFe><infNFe>
        <det nItem="1">
          <prod cProd="A1" qCom="1"><xProd>Item</xProd>
            <med><nLote>L1</nLote></med>
            <med><nLote>L2</nLote></med>
            <med><nLote>L3</nLote></med>
          </prod>
        </det>
      </infNFe></NFe>
    </nfeProc>`;
    const products = await extractProductsFromXml(xmlOne);
    expect(products[0].batches.map((b) => b.quantity)).toEqual([0, 0, 1]);
  });
});
