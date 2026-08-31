import { describe, expect, it } from 'vitest';
import { assertDestinatarioClientePj } from '@/lib/nfe-emission/types';
import { mergeDestinatario } from '@/lib/nfe-emission/destinatario';
import { nfeEmissionPayloadSchema } from '@/lib/nfe-emission/schema';

describe('nfe-emission destinatário e payload', () => {
  const clientes = ['12345678000199'];

  it('recusa CPF e CNPJ que não é cliente', () => {
    expect(() => assertDestinatarioClientePj('12345678901', clientes)).toThrow(/pessoa jurídica/);
    expect(() => assertDestinatarioClientePj('98765432000188', clientes)).toThrow(/cadastrado/);
    expect(() => assertDestinatarioClientePj('12.345.678/0001-99', clientes)).not.toThrow();
  });

  it('recusa destinatário sem município IBGE', () => {
    expect(() => mergeDestinatario('12345678000199', clientes, {
      name: 'Hospital',
      street: 'Rua A',
      number: '1',
      district: 'Centro',
      city: 'Campo Grande',
      state: 'MS',
      zip: '79002000',
    })).toThrow(/IBGE/);
  });

  it('monta destinatário PJ completo', () => {
    const dest = mergeDestinatario('12345678000199', clientes, {
      name: 'Hospital',
      ie: '123',
      street: 'Rua A',
      number: '1',
      district: 'Centro',
      city: 'Campo Grande',
      state: 'MS',
      zip: '79002-000',
      cMun: '5002704',
    });
    expect(dest.cnpj).toBe('12345678000199');
    expect(dest.indIEDest).toBe('1');
    expect(dest.ender.cMun).toBe('5002704');
  });

  it('payload aceita CFOP de consignação e rejeita CFOP fora do catálogo', () => {
    const base = {
      natureza: 'Remessa em consignacao',
      series: '2',
      destCnpj: '12345678000199',
      indFinal: '0' as const,
      indPres: '1' as const,
      items: [{
        productId: 'p1',
        cProd: 'X',
        xProd: 'Item',
        ncm: '90213980',
        cfop: '5917',
        uCom: 'UN',
        qCom: '1',
        vUnCom: '10.00',
      }],
    };
    expect(nfeEmissionPayloadSchema.parse({ ...base, cfop: '5917' }).cfop).toBe('5917');
    expect(nfeEmissionPayloadSchema.parse({ ...base, cfop: '1918', natureza: 'Dev. de merc. rem. em consig.' }).cfop).toBe('1918');
    expect(nfeEmissionPayloadSchema.safeParse({ ...base, cfop: '1102' }).success).toBe(false);
  });
});
