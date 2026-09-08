import { describe, expect, it } from 'vitest';
import { analyzeSefazRejection } from '@/lib/nfe-emission/sefaz-analysis';

describe('analyzeSefazRejection (SPEC-062)', () => {
  it('215 aponta falha de schema e menciona med/vPMC', () => {
    const a = analyzeSefazRejection({
      status: 'rejected',
      sefazStat: '215',
      sefazMotivo: 'Rejeicao: Falha no esquema XML',
    });
    expect(a.code).toBe('215');
    expect(a.severity).toBe('danger');
    expect(a.title.toLowerCase()).toMatch(/esquema|schema/);
    expect(a.hints.some((h) => /vPMC|med/i.test(h))).toBe(true);
  });

  it('rascunho sem SEFAZ fica info', () => {
    const a = analyzeSefazRejection({ status: 'draft' });
    expect(a.severity).toBe('info');
    expect(a.title).toMatch(/Rascunho/i);
  });

  it('autorizada é success', () => {
    const a = analyzeSefazRejection({ status: 'authorized', sefazStat: '100' });
    expect(a.severity).toBe('success');
  });

  it('297 aponta assinatura/C14N do SignedInfo', () => {
    const a = analyzeSefazRejection({
      status: 'rejected',
      sefazStat: '297',
      sefazMotivo: 'Rejeicao: Assinatura difere do calculado',
    });
    expect(a.code).toBe('297');
    expect(a.severity).toBe('danger');
    expect(a.title.toLowerCase()).toMatch(/assinatura/);
    expect(a.hints.some((h) => /C14N|SignedInfo|280/i.test(h))).toBe(true);
  });
});
