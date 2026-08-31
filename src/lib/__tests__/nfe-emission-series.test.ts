import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERIES } from '@/lib/nfe-emission/issued-defaults';
import { nfeEmissionPayloadSchema } from '@/lib/nfe-emission/schema';

const basePayload = {
  natureza: 'Venda merc.adq. ou recb. terc.',
  cfop: '5102',
  destCnpj: '12345678000199',
  indFinal: '1' as const,
  indPres: '9' as const,
  items: [{
    productId: 'p1',
    cProd: 'X',
    xProd: 'Item',
    ncm: '90213980',
    cfop: '5102',
    uCom: 'UN',
    qCom: '1',
    vUnCom: '10.00',
  }],
};

describe('emissão manual: série 2 fixa', () => {
  it('constante canônica é 2', () => {
    expect(DEFAULT_SERIES).toBe('2');
  });

  it('payload com series 1 falha', () => {
    const parsed = nfeEmissionPayloadSchema.safeParse({ ...basePayload, series: '1' });
    expect(parsed.success).toBe(false);
  });

  it('payload com series 2 passa e permanece 2', () => {
    const parsed = nfeEmissionPayloadSchema.parse({ ...basePayload, series: '2' });
    expect(parsed.series).toBe(DEFAULT_SERIES);
    expect(parsed.series).toBe('2');
  });

  it('payload sem series assume 2', () => {
    const parsed = nfeEmissionPayloadSchema.parse(basePayload);
    expect(parsed.series).toBe(DEFAULT_SERIES);
  });

  it('UI não edita série e envia DEFAULT_SERIES', () => {
    const src = readFileSync(
      resolve(__dirname, '../../app/(painel)/fiscal/issued/nova/page-client.tsx'),
      'utf8',
    );
    expect(src).toContain('series: DEFAULT_SERIES');
    expect(src).not.toMatch(/\bsetSeries\b/);
    const serieField = src.match(/<Field label="Série"[\s\S]*?<\/Field>/);
    expect(serieField?.[0]).toBeTruthy();
    expect(serieField?.[0]).toContain('{DEFAULT_SERIES}');
    expect(serieField?.[0]).not.toMatch(/<(input|select)\b/);
  });

  it('UI: destinatário primeiro; natureza, série, finalidade nessa ordem', () => {
    const src = readFileSync(
      resolve(__dirname, '../../app/(painel)/fiscal/issued/nova/page-client.tsx'),
      'utf8',
    );
    const dados = src.match(/id=\{nfeSectionId\('dados'\)\}[\s\S]*?id=\{nfeSectionId\('itens'\)\}/);
    expect(dados?.[0]).toBeTruthy();
    const block = dados![0];
    const dest = block.indexOf('>Destinatário<');
    const nat = block.indexOf('label="Natureza / CFOP"');
    const ser = block.indexOf('label="Série"');
    const fin = block.indexOf('label="Finalidade"');
    expect(dest).toBeGreaterThanOrEqual(0);
    expect(nat).toBeGreaterThan(dest);
    expect(ser).toBeGreaterThan(nat);
    expect(fin).toBeGreaterThan(ser);
  });

  it('UI: série, finalidade e consumidor final na mesma linha compacta', () => {
    const src = readFileSync(
      resolve(__dirname, '../../app/(painel)/fiscal/issued/nova/page-client.tsx'),
      'utf8',
    );
    const row = src.match(/data-nfe-serie-finalidade-linha[\s\S]*?<\/div>/);
    expect(row?.[0]).toBeTruthy();
    const block = row![0];
    expect(block).toMatch(/flex-wrap/);
    expect(block).toMatch(/sm:grid-cols-3/);
    const ser = block.indexOf('label="Série"');
    const fin = block.indexOf('label="Finalidade"');
    const cons = block.indexOf('label="Consumidor final"');
    expect(ser).toBeGreaterThanOrEqual(0);
    expect(fin).toBeGreaterThan(ser);
    expect(cons).toBeGreaterThan(fin);
  });
});
