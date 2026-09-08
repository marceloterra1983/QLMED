import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clampCartQty,
  defaultCfopForTab,
  groupBalancesByCatalog,
  tabRequiresCustomer,
  tabUsesCdStock,
} from '@/lib/saida-material';

describe('SPEC-057 saida-material helpers', () => {
  it('mapeia aba → CFOP default', () => {
    expect(defaultCfopForTab('consignado')).toBe('5917');
    expect(defaultCfopForTab('venda_direta')).toBe('5102');
    expect(defaultCfopForTab('material_usado')).toBe('5114');
    expect(defaultCfopForTab('saida_avulsa')).toBeNull();
  });

  it('exige cliente nas abas certas', () => {
    expect(tabRequiresCustomer('consignado')).toBe(true);
    expect(tabRequiresCustomer('venda_direta')).toBe(true);
    expect(tabRequiresCustomer('material_usado')).toBe(true);
    expect(tabRequiresCustomer('saida_avulsa')).toBe(false);
  });

  it('Material Usado não usa estoque CD', () => {
    expect(tabUsesCdStock('material_usado')).toBe(false);
    expect(tabUsesCdStock('consignado')).toBe(true);
  });

  it('clampCartQty limita ao saldo e zera inválidos', () => {
    expect(clampCartQty(5, 3)).toBe(3);
    expect(clampCartQty(2, 10)).toBe(2);
    expect(clampCartQty(-1, 5)).toBe(0);
    expect(clampCartQty(3, 0)).toBe(0);
    expect(clampCartQty(Number.NaN, 5)).toBe(0);
  });

  it('groupBalancesByCatalog agrupa por tipo/subtipo e ignora qty<=0', () => {
    const groups = groupBalancesByCatalog([
      {
        productCodigo: 'A1',
        productName: 'Produto A',
        productType: 'Linha X',
        productSubtype: 'Grupo 1',
        lot: 'L1',
        lotExpiry: '2026-12-01',
        quantity: 2,
      },
      {
        productCodigo: 'A1',
        productName: 'Produto A',
        productType: 'Linha X',
        productSubtype: 'Grupo 1',
        lot: 'L2',
        lotExpiry: '2027-01-01',
        quantity: 1,
      },
      {
        productCodigo: 'B1',
        productName: 'Produto B',
        productType: 'Linha Y',
        productSubtype: 'Grupo 2',
        lot: 'L9',
        lotExpiry: null,
        quantity: 0,
      },
      {
        productCodigo: 'C1',
        productName: 'Produto C',
        productType: 'Linha X',
        productSubtype: 'Grupo 1',
        lot: 'L3',
        lotExpiry: null,
        quantity: 4,
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].productType).toBe('Linha X');
    expect(groups[0].products).toHaveLength(2);
    const a = groups[0].products.find((p) => p.productCodigo === 'A1')!;
    expect(a.totalQty).toBe(3);
    expect(a.lots).toHaveLength(2);
  });
});

describe('SPEC-063 saida-material → emissão', () => {
  it('emitNfe envia lote do carrinho', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/(painel)/estoque/saida-material/page-client.tsx'),
      'utf8',
    );
    expect(src).toContain('lot: line.lot');
    expect(src).toContain('lotExpiry: line.lotExpiry');
  });
});
