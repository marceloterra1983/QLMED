import { describe, expect, it } from 'vitest';
import {
  decideBillingMatches,
  digitsCnpj,
  extractInfCpl,
  isUnimedCgBillingRecipient,
  patientNameMatchesInfCpl,
  isUnimedCgBilledStatus,
  serializeBilledCandidates,
} from '@/lib/unimed-cg/billing-match';
import { UNIMED_CG_BILLING_RECIPIENT_CNPJ } from '@/lib/unimed-cg/constants';

describe('unimed-cg billing-match', () => {
  it('digitsCnpj e filtro Unimed', () => {
    expect(digitsCnpj('03.315.918/0001-18')).toBe('03315918000118');
    expect(digitsCnpj(UNIMED_CG_BILLING_RECIPIENT_CNPJ)).toBe('03315918000118');
    expect(isUnimedCgBillingRecipient('03.315.918/0001-18')).toBe(true);
    expect(isUnimedCgBillingRecipient('03315918000118')).toBe(true);
    expect(isUnimedCgBillingRecipient('00.000.000/0001-00')).toBe(false);
  });

  it('extractInfCpl lê e decodifica XML', () => {
    const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe><infAdic><infCpl>PACIENTE: JOAO DA SILVA &amp; CIA</infCpl></infAdic></infNFe></NFe></nfeProc>`;
    expect(extractInfCpl(xml)).toBe('PACIENTE: JOAO DA SILVA & CIA');
    expect(extractInfCpl('<nfe/>')).toBeNull();
    expect(extractInfCpl(null)).toBeNull();
  });

  it('patientNameMatchesInfCpl exige ≥2 tokens e substring fold', () => {
    expect(patientNameMatchesInfCpl('João Silva', 'Ref paciente JOAO SILVA procedimento')).toBe(true);
    expect(patientNameMatchesInfCpl('JOAO', 'JOAO SILVA')).toBe(false);
    expect(patientNameMatchesInfCpl('Maria Souza', 'JOAO SILVA')).toBe(false);
    expect(patientNameMatchesInfCpl('José Antônio', 'paciente JOSE ANTONIO ok')).toBe(true);
  });

  it('unique NF → matched', () => {
    const invoices = [
      { id: 'a', number: '100', infCpl: 'Beneficiario MARIA CLARA SANTOS' },
      { id: 'b', number: '101', infCpl: 'Outro texto' },
    ];
    const one = decideBillingMatches('Maria Clara Santos', invoices);
    expect(one.status).toBe('matched');
    if (one.status === 'matched') expect(one.invoice.number).toBe('100');
  });

  it('multi-NF mesmo process → ambiguous com candidatos serializados', () => {
    const invoices = [
      { id: 'a', number: '100', infCpl: 'Beneficiario MARIA CLARA SANTOS' },
      { id: 'b', number: '101', infCpl: 'Outro texto' },
      { id: 'c', number: '102', infCpl: 'Tambem MARIA CLARA SANTOS aqui' },
    ];
    const amb = decideBillingMatches('Maria Clara Santos', invoices);
    expect(amb.status).toBe('ambiguous');
    if (amb.status === 'ambiguous') {
      expect(amb.invoices.map((i) => i.number)).toEqual(['100', '102']);
      expect(serializeBilledCandidates(amb.invoices)).toEqual([
        { id: 'a', number: '100' },
        { id: 'c', number: '102' },
      ]);
    }
    expect(isUnimedCgBilledStatus('ambiguous')).toBe(true);
    expect(isUnimedCgBilledStatus('matched')).toBe(true);
    expect(isUnimedCgBilledStatus(null)).toBe(false);
  });

  it('dois processIds com mesmo patientName e uma NF única → ambos matched independentemente', () => {
    // Ambiguity is per processId vs invoice set, not "name reused across processes".
    const invoices = [
      { id: 'nf1', number: '200', infCpl: 'PACIENTE JOAO PEDRO LIMA procedimento' },
      { id: 'nf2', number: '201', infCpl: 'sem este nome' },
    ];
    const processA = decideBillingMatches('Joao Pedro Lima', invoices);
    const processB = decideBillingMatches('Joao Pedro Lima', invoices);
    expect(processA.status).toBe('matched');
    expect(processB.status).toBe('matched');
    if (processA.status === 'matched' && processB.status === 'matched') {
      expect(processA.invoice.id).toBe('nf1');
      expect(processB.invoice.id).toBe('nf1');
    }
  });

  it('none quando nome não aparece', () => {
    const invoices = [{ id: 'b', number: '101', infCpl: 'Outro texto' }];
    expect(decideBillingMatches('Maria Clara Santos', invoices).status).toBe('none');
  });
});
