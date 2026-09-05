import { describe, expect, it } from 'vitest';
import {
  normalizeSpicaRelRow,
  parseBrPercent,
  parseTipoSpica,
  splitSitTributaria,
  normalizeAnvisaRvs,
  normalizeNcm,
  parseInstrumental,
} from '@/lib/spica/parse';

describe('spica/parse', () => {
  it('parseBrPercent aceita 17,00 e 0,65', () => {
    expect(parseBrPercent('17,00')).toBe(17);
    expect(parseBrPercent('0,65')).toBe(0.65);
    expect(parseBrPercent('3,00')).toBe(3);
    expect(parseBrPercent('')).toBeNull();
    expect(parseBrPercent('101,00')).toBeNull();
  });

  it('splitSitTributaria separa origem e CST', () => {
    expect(splitSitTributaria('240')).toEqual({
      sitTributaria: '240',
      origem: '2',
      cstIcms: '40',
    });
    expect(splitSitTributaria('000')).toEqual({
      sitTributaria: '000',
      origem: '0',
      cstIcms: '00',
    });
    expect(splitSitTributaria('041')).toEqual({
      sitTributaria: '041',
      origem: '0',
      cstIcms: '41',
    });
  });

  it('parseTipoSpica mapeia ORTOPEDIA e FORA DE LINHA', () => {
    const a = parseTipoSpica('3 - ORTOPEDIA');
    expect(a.productType).toBe('ORTOPEDIA');
    expect(a.outOfLine).toBe(false);
    expect(a.invalid).toBe(false);

    const b = parseTipoSpica('6 - FORA DE LINHA - HEMOD.');
    expect(b.outOfLine).toBe(true);
    expect(b.productType).toBe('HEMODINAMICA');
    expect(b.invalid).toBe(false);
  });

  it('parseTipoSpica marca MEDTRONIC como invalido', () => {
    const t = parseTipoSpica('MEDTRONIC');
    expect(t.invalid).toBe(true);
    expect(t.productType).toBeNull();
  });

  it('ANVISA so com 11 digitos; NCM com 8', () => {
    expect(normalizeAnvisaRvs('10360810022')).toBe('10360810022');
    expect(normalizeAnvisaRvs('1036081002')).toBeNull();
    expect(normalizeNcm('90189099')).toBe('90189099');
    expect(normalizeNcm('9018909')).toBeNull();
  });

  it('instrumental Sim/Nao', () => {
    expect(parseInstrumental('Sim')).toBe(true);
    expect(parseInstrumental('Não')).toBe(false);
  });

  it('normalizeSpicaRelRow monta linha fiscal e flags', () => {
    const row = normalizeSpicaRelRow({
      codigo: '5999',
      referencia: 'CAIXA OSSEA 101',
      nome: '(101) CAIXA',
      tipo: '3 - ORTOPEDIA',
      subtipo: 'CAIXAS DE ORTOPEDIA',
      fabricante: 'OSSEA',
      instrumental: 'Não',
      rvs: '80071910005',
      ncm: '90189099',
      sitTributaria: '000',
      nomeTributacao: '000 - NACIONAL TRIBUTADO TOTAL (Pis/Cofins/ICMS)',
      icms: '17,00',
      pis: '0,65',
      cofins: '3,00',
      ipiEntrada: '0,00',
      ipiSaida: '0,00',
    });
    expect(row.codigo).toBe('005999');
    expect(row.fiscalIcms).toBe(17);
    expect(row.fiscalPis).toBe(0.65);
    expect(row.fiscalOrigem).toBe('0');
    expect(row.anvisaCode).toBe('80071910005');
    expect(row.ipiSaidaNaoZero).toBe(false);
    expect(row.tipoInvalid).toBe(false);
    // Tipo Spica → Linha; SubTipo → Grupo; Subgrupo sempre null (sem 3º nível na origem)
    expect(row.productType).toBe('ORTOPEDIA');
    expect(row.productSubtype).toBe('CAIXAS DE ORTOPEDIA');
    expect(row.productSubgroup).toBeNull();
  });

  it('FORA DE LINHA - CARDIACA vira Linha CARDIACA fora de linha; SubTipo vira Grupo', () => {
    const row = normalizeSpicaRelRow({
      codigo: '3884',
      referencia: 'ALX-256',
      nome: 'ALEXIS RETRATOR',
      tipo: '7 - FORA DE LINHA - CARDIACA',
      subtipo: 'CARDIACA - ST JUDE',
      fabricante: 'ST JUDE',
      instrumental: 'Não',
      rvs: '',
      ncm: '',
      sitTributaria: '000',
      nomeTributacao: '',
      icms: '17,00',
      pis: '0,65',
      cofins: '3,00',
      ipiEntrada: '0,00',
    });
    expect(row.productType).toBe('CARDIACA');
    expect(row.outOfLine).toBe(true);
    expect(row.productSubtype).toBe('CARDIACA - ST JUDE');
    expect(row.productSubgroup).toBeNull();
  });

  it('ref _ e tipo invalido + inconsistencia CST/ICMS', () => {
    const row = normalizeSpicaRelRow({
      codigo: '000691',
      referencia: '_',
      nome: 'X',
      tipo: 'MEDTRONIC',
      subtipo: '',
      fabricante: 'M',
      instrumental: 'Sim',
      rvs: '',
      ncm: '',
      sitTributaria: '000',
      nomeTributacao: '040 - NACIONAL ISENTO ICMS E TRIBUTADO PIS/CONFINS',
      icms: '0,00',
      pis: '0,65',
      cofins: '3,00',
      ipiEntrada: '0,00',
    });
    expect(row.refInvalid).toBe(true);
    expect(row.tipoInvalid).toBe(true);
    expect(row.productType).toBeNull();
    expect(row.productSubtype).toBeNull();
    expect(row.productSubgroup).toBeNull();
    expect(row.instrumental).toBe(true);
    expect(row.fiscalInconsistente).toBe(true);
  });
});
