import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_IND_PRES } from '@/lib/nfe-emission/issued-defaults';
import { nfeEmissionPayloadSchema } from '@/lib/nfe-emission/schema';
import { buildUnsignedNfeXml } from '@/lib/nfe-emission/xml-builder';
import { buildNfeAccessKey } from '@/lib/nfe-emission/access-key';
import type { NfeEmissionDraft } from '@/lib/nfe-emission/types';

const basePayload = {
  natureza: 'Venda merc.adq. ou recb. terc.',
  cfop: '5102',
  destCnpj: '12345678000199',
  indFinal: '1' as const,
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

function pageSrc(): string {
  return readFileSync(
    resolve(__dirname, '../../app/(painel)/fiscal/issued/nova/page-client.tsx'),
    'utf8',
  );
}

describe('emissão manual: indPres fixo 9 (não presencial — outros)', () => {
  it('constante canônica é 9', () => {
    expect(DEFAULT_IND_PRES).toBe('9');
  });

  it('UI não expõe select de presença e envia DEFAULT_IND_PRES', () => {
    const src = pageSrc();
    expect(src).not.toMatch(/IND_PRES_OPTIONS/);
    expect(src).not.toMatch(/Presença do comprador/);
    expect(src).not.toMatch(/\bsetIndPres\b/);
    expect(src).toContain('indPres: DEFAULT_IND_PRES');
  });

  it('schema força 9 mesmo se o client mandar outro valor', () => {
    expect(nfeEmissionPayloadSchema.parse({ ...basePayload, indPres: '1' }).indPres).toBe('9');
    expect(nfeEmissionPayloadSchema.parse({ ...basePayload, indPres: '0' }).indPres).toBe('9');
    expect(nfeEmissionPayloadSchema.parse(basePayload).indPres).toBe(DEFAULT_IND_PRES);
  });

  it('XML de rascunho com DEFAULT_IND_PRES grava <indPres>9</indPres>', () => {
    const issueDate = new Date(2026, 7, 30, 10, 0, 0);
    const accessKey = buildNfeAccessKey({
      cUf: '50',
      issueDate,
      cnpj: '12345678000199',
      series: '2',
      number: '8',
      cNf: '11111111',
    });
    const ender = {
      xLgr: 'Rua A',
      nro: '10',
      xBairro: 'Centro',
      cMun: '5002704',
      xMun: 'Campo Grande',
      UF: 'MS',
      CEP: '79002000',
    };
    const draft: NfeEmissionDraft = {
      natureza: 'Venda merc.adq. ou recb. terc.',
      cfop: '5102',
      series: '2',
      number: '8',
      issueDate,
      finNFe: '1',
      indFinal: '1',
      indPres: DEFAULT_IND_PRES,
      tpAmb: '2',
      modFrete: '0',
      accessKey,
      emit: {
        cnpj: '12345678000199',
        xNome: 'Emitente',
        ie: '123',
        crt: '3',
        ender,
      },
      dest: {
        cnpj: '98765432000188',
        xNome: 'Dest',
        indIEDest: '1',
        ie: '456',
        ender,
      },
      items: [{
        cProd: 'X',
        xProd: 'Item',
        ncm: '90213980',
        cfop: '5102',
        uCom: 'UN',
        qCom: '1',
        vUnCom: '10.00',
      }],
    };
    const xml = buildUnsignedNfeXml(draft);
    expect(xml).toContain('<indPres>9</indPres>');
    expect(xml).not.toContain('<indPres>1</indPres>');
  });
});
