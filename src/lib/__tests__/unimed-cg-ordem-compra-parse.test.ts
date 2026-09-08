import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPurchaseOrderFileName,
  extractOrderNumberFromSubject,
  isUnimedCgPurchaseOrderSubject,
  parsePurchaseOrderText,
  parseSoulMvNumber,
} from '@/lib/unimed-cg/parse-purchase-order';

const FIXTURE = readFileSync(
  resolve(__dirname, 'fixtures/unimed-cg-oc-188246.txt'),
  'utf8',
);

const GTPLAN = readFileSync(
  resolve(__dirname, 'fixtures/unimed-cg-oc-186184-gtplan.txt'),
  'utf8',
);

describe('unimed-cg ordem de compra parse', () => {
  it('reconhece assunto de OC no singular e no plural', () => {
    expect(isUnimedCgPurchaseOrderSubject(
      'Ordem de compras 188246 - QL MED MATERIAIS HOSPITALARES LTDA',
    )).toBe(true);
    expect(isUnimedCgPurchaseOrderSubject('ORDEM DE COMPRA 12')).toBe(true);
    expect(isUnimedCgPurchaseOrderSubject('[ID 1] [OPME] autorização de faturamento do processo')).toBe(false);
    expect(extractOrderNumberFromSubject('Ordem de compras 188246 - QL MED')).toBe('188246');
    expect(isUnimedCgPurchaseOrderSubject(
      'Confirmação da Ordem de compra 186184 - QL MED - MATERIAIS HOSPITALARES LTDA',
    )).toBe(true);
    expect(extractOrderNumberFromSubject(
      'Confirmação da Ordem de compra 186184 - QL MED - MATERIAIS HOSPITALARES LTDA',
    )).toBe('186184');
  });

  it('converte números SOULMV sem float', () => {
    expect(parseSoulMvNumber('2.100,00')).toBe('2100.00');
    expect(parseSoulMvNumber('50,0000')).toBe('50.0000');
    expect(parseSoulMvNumber('42,0000')).toBe('42.0000');
  });

  it('extrai OC 188246 do fixture SOULMV', () => {
    const parsed = parsePurchaseOrderText(FIXTURE, '188246');
    expect(parsed.orderNumber).toBe('188246');
    expect(parsed.requestNumber).toBe('143041');
    expect(parsed.orderDate?.toISOString().startsWith('2026-09-04')).toBe(true);
    expect(parsed.billingCnpj).toBe('03315918000541');
    expect(parsed.paymentTerms).toMatch(/30\s*DIAS/i);
    expect(parsed.supplierCnpj).toBe('07832309000197');
    expect(parsed.totalAmount).toBe('2100.00');
    expect(parsed.parseStatus).toBe('ok');
    expect(parsed.items).toHaveLength(1);
    const item = parsed.items[0];
    expect(item?.productCode).toBe('78811');
    expect(item?.description).toMatch(/EXTENSOR DE\s+BOMBA/i);
    expect(item?.description).toMatch(/SM-PL-\s*12P120RF-MP/i);
    expect(item?.unit).toBe('UNIDADE');
    expect(item?.quantity).toBe('50.0000');
    expect(item?.unitPrice).toBe('42.00');
    expect(item?.lineTotal).toBe('2100.00');
  });

  it('buildPurchaseOrderFileName', () => {
    expect(buildPurchaseOrderFileName('188246')).toBe('UNIMED-CG-OC 188246.pdf');
  });

  it('extrai OC 186184 do fixture GTPlan', () => {
    const parsed = parsePurchaseOrderText(GTPLAN, '186184');
    expect(parsed.orderNumber).toBe('186184');
    expect(parsed.orderDate?.toISOString().startsWith('2026-06-16')).toBe(true);
    expect(parsed.billingCnpj).toBe('03315918000541');
    expect(parsed.paymentTerms).toMatch(/30\s*dias/i);
    expect(parsed.paymentTermsCode).toBe('7');
    expect(parsed.supplierCnpj).toBe('07832309000197');
    expect(parsed.totalAmount).toBe('56000.00');
    expect(parsed.parseStatus).toBe('ok');
    expect(parsed.items).toHaveLength(1);
    const item = parsed.items[0];
    expect(item?.productCode).toBe('88271');
    expect(item?.description).toMatch(/dispositivo de autotransfusao/i);
    expect(item?.description).toMatch(/cell saver/i);
    expect(item?.unit).toBe('UNIDADE');
    expect(item?.quantity).toBe('20');
    expect(item?.unitPrice).toBe('2800.00');
    expect(item?.lineTotal).toBe('56000.00');
  });
});
