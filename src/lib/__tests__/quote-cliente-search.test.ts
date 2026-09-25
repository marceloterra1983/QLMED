import { describe, expect, it } from 'vitest';
import { orderQuoteClientes, rankQuoteCliente } from '@/lib/orcamentos/catalog';

const SANTA = {
  cnpj: '11111111000111',
  name: 'ASSOCIACAO DE BENEFICENCIA E CARIDADE',
  shortName: 'Santa Casa',
};
const RAZAO = {
  cnpj: '22222222000122',
  name: 'SANTA CASA DE MISERICORDIA DE CAMPO GRANDE',
  shortName: null,
};
const HMS = {
  cnpj: '33333333000133',
  name: 'HOSPITAL MUNICIPAL DE SAUDE',
  shortName: 'HMS',
};

describe('busca de cliente do orçamento', () => {
  it('prioriza quem casa pelo nome abreviado, mesmo com razão que também contém o termo', () => {
    const ordered = orderQuoteClientes([RAZAO, SANTA], 'santa');
    expect(ordered.map((row) => row.cnpj)).toEqual([SANTA.cnpj, RAZAO.cnpj]);
    expect(rankQuoteCliente('santa', SANTA)).toBe(0);
    expect(rankQuoteCliente('santa', RAZAO)).toBe(2);
  });

  it('acha o abreviado que a razão não contém e ignora acento', () => {
    const sao = {
      cnpj: '44444444000144',
      name: 'IRMANDADE DO HOSPITAL',
      shortName: 'São Lucas',
    };
    expect(rankQuoteCliente('sao', sao)).toBe(0);
    expect(rankQuoteCliente('hms', HMS)).toBe(0);
    expect(rankQuoteCliente('hms', { ...HMS, shortName: '   ' })).toBe(2);
    const ordered = orderQuoteClientes([RAZAO, HMS, sao], 'hms');
    expect(ordered[0]?.cnpj).toBe(HMS.cnpj);
  });

  it('termo no meio do abreviado fica na frente da razão', () => {
    expect(rankQuoteCliente('casa', SANTA)).toBe(1);
    const ordered = orderQuoteClientes([RAZAO, SANTA], 'casa');
    expect(ordered[0]?.cnpj).toBe(SANTA.cnpj);
  });
});
