import { describe, expect, it } from 'vitest';
import { storedEmissionTotal } from '@/lib/nfe-emission/xml-builder';
import type { NfeEmissionItem } from '@/lib/nfe-emission/types';

const item: NfeEmissionItem = {
  cProd: 'A',
  xProd: 'Item',
  ncm: '90213980',
  cfop: '5102',
  uCom: 'UN',
  qCom: '2',
  vUnCom: '10.00',
};

describe('storedEmissionTotal', () => {
  it('soma frete, seguro e outras ao total dos itens', () => {
    expect(storedEmissionTotal({ items: [item], vFrete: '5.00', vSeg: '1.00', vOutro: '0.50' })).toBe('26.50');
    expect(storedEmissionTotal({ items: [item] })).toBe('20.00');
  });
});
