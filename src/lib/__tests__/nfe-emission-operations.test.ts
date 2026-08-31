import { describe, expect, it } from 'vitest';
import {
  assertCfopMatchesUfs,
  FREQUENT_SAIDA_CFOPS,
  idDestFromUfs,
  listSaidaOperations,
  splitSaidaOperationsForDropdown,
} from '@/lib/nfe-emission/operations';

describe('nfe-emission operations', () => {
  it('lista todas as saídas do catálogo com tag e natureza', () => {
    const ops = listSaidaOperations();
    const tags = new Set(ops.map((op) => op.tag));
    expect(ops.length).toBeGreaterThanOrEqual(20);
    expect(tags.has('Venda')).toBe(true);
    expect(tags.has('Consignação')).toBe(true);
    expect(tags.has('Comodato')).toBe(true);
    expect(tags.has('Demonstração')).toBe(true);
    expect(tags.has('Bonificação')).toBe(true);
    expect(ops.every((op) => /^\d{4}$/.test(op.cfop))).toBe(true);
    expect(ops.find((op) => op.cfop === '5102')?.natureza).toBe('Venda merc.adq. ou recb. terc.');
    expect(ops.find((op) => op.cfop === '6102')?.natureza).toBe('Venda fora do estado');
    expect(ops.find((op) => op.cfop === '5917')?.natureza).toBe('Remessa de consignacao');
    expect(ops.find((op) => op.cfop === '1918')?.natureza).toBe('Dev. de merc. rem. em consig.');
    expect(ops.find((op) => op.cfop === '1202')?.cfop).toBe('1202');
    expect(ops.find((op) => op.cfop === '2918')?.ambito).toBe('interestadual');
  });

  it('recusa CFOP interno para destinatário de outra UF', () => {
    expect(() => assertCfopMatchesUfs('5102', 'MS', 'SP')).toThrow(/interno/);
    expect(() => assertCfopMatchesUfs('6102', 'MS', 'MS')).toThrow(/interestadual/);
    expect(() => assertCfopMatchesUfs('5102', 'MS', 'MS')).not.toThrow();
    expect(() => assertCfopMatchesUfs('6102', 'MS', 'SP')).not.toThrow();
    expect(() => assertCfopMatchesUfs('1918', 'MS', 'MS')).not.toThrow();
    expect(() => assertCfopMatchesUfs('2918', 'MS', 'MT')).not.toThrow();
    expect(() => assertCfopMatchesUfs('1918', 'MS', 'MT')).toThrow(/interno/);
  });

  it('idDest interno vs interestadual', () => {
    expect(idDestFromUfs('MS', 'MS')).toBe('1');
    expect(idDestFromUfs('MS', 'SP')).toBe('2');
    expect(idDestFromUfs('MS', 'EX')).toBe('3');
  });

  it('top 5 do dropdown é o ranking medido nas emitidas', () => {
    expect([...FREQUENT_SAIDA_CFOPS]).toEqual(['5102', '6102', '5917', '1918', '6917']);
    const ops = listSaidaOperations();
    expect(ops.slice(0, 5).map((op) => op.cfop)).toEqual(['5102', '6102', '5917', '1918', '6917']);
    expect(ops.slice(0, 5).every((op) => op.featured)).toBe(true);
  });

  it('resto numérico do catálogo sem duplicar o topo', () => {
    const ops = listSaidaOperations();
    const { featured, rest } = splitSaidaOperationsForDropdown(ops);
    expect(featured.map((op) => op.cfop)).toEqual(['5102', '6102', '5917', '1918', '6917']);
    expect(rest.every((op) => !op.featured)).toBe(true);
    expect(rest.map((op) => op.cfop)).toEqual([...rest.map((op) => op.cfop)].sort((a, b) => Number(a) - Number(b)));
    const all = [...featured, ...rest].map((op) => op.cfop);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(ops.length);
    expect(rest.some((op) => op.cfop === '5102')).toBe(false);
    expect(rest[0]?.cfop).toBe('1202');
  });
});
