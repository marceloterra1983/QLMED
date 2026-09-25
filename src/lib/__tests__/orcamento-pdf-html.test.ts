import { describe, expect, it } from 'vitest';
import { buildIssuer, QL_MED_ISSUER } from '../orcamentos/issuer';
import { buildQuoteHtml } from '../orcamentos/pdf-html';

const fixture = {
  number: 8318,
  issuedAt: '2026-09-15',
  status: 'issued' as const,
  customerName: 'INSTITUTO DE ASSISTENCIA A SAUDE DOS SERVIDORES DO ESTADO D',
  customerCnpj: '05794356000168',
  customerIe: 'ISENTO',
  customerCode: '00571',
  customerStreet: 'Avenida das Flores',
  customerNumber: '941',
  customerDistrict: 'Jardim Cuiabá',
  customerCity: 'Cuiabá',
  customerState: 'MT',
  customerZip: '78043172',
  salesperson: null,
  patientName: 'LUIZ CARLOS DE ALMEIDA',
  doctorName: 'Paulo Ruiz',
  convenio: 'MT SAUDE - 007',
  local: 'AMECOR ASSIST MEDICA CARDIOL LTDA',
  notes: '(DADOS CONTA CORRENTE: BANCO BRASIL, AG: 2936-X, C/C: 119.005-9)',
  freight: '0.00',
  subtotal: '3800.00',
  total: '3800.00',
  items: [
    {
      lineNumber: 1,
      code: '4326202',
      description: 'KIT AUTOTRANSFUSÃO X-TRA 225',
      rvs: '80102511537',
      ncm: '90183929',
      unit: 'UN',
      quantity: '1',
      unitPrice: '3800.00',
      discount: '0.00',
      lineTotal: '3800.00',
    },
  ],
};

describe('SPEC-085 — HTML do PDF no modelo SPICA H020', () => {
  it('reproduz os campos do orçamento de Luiz Carlos de Almeida', () => {
    const html = buildQuoteHtml(fixture, buildIssuer({}));
    expect(html).toContain('ORÇAMENTO');
    expect(html).toContain('00008318');
    expect(html).toContain('INSTITUTO DE ASSISTENCIA A SAUDE DOS SERVIDORES DO ESTADO D');
    expect(html).toContain('4326202');
    expect(html).toContain('KIT AUTOTRANSFUSÃO X-TRA 225');
    expect(html).toContain('80102511537');
    expect(html).toContain('90183929');
    expect(html).toContain('3.800,00');
    expect(html).toContain('LUIZ CARLOS DE ALMEIDA');
    expect(html).toContain('Paulo Ruiz');
    expect(html).toContain('MT SAUDE - 007');
    expect(html).toContain('AMECOR ASSIST MEDICA CARDIOL LTDA');
    expect(html).toContain(QL_MED_ISSUER.razaoSocial);
    expect(html).toContain('class="rule"');
    expect(html).toContain('Sub-Total:');
    expect(html).not.toContain('joinner');
    expect(html).not.toContain('SPICA');
  });

  it('marca d\'água em orçamento cancelado', () => {
    const html = buildQuoteHtml({ ...fixture, status: 'cancelled' }, buildIssuer({}));
    expect(html).toContain('CANCELADO');
  });
});
