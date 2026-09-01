import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeImpcgParseGap, presentImpcgReadStatus } from '@/lib/impcg/parse-oficio';

const pageClient = readFileSync(
  resolve(process.cwd(), 'src/app/(painel)/gestao/impcg/page-client.tsx'),
  'utf8',
);
const itemsEditor = readFileSync(
  resolve(process.cwd(), 'src/components/gestao/ImpcgItemsEditor.tsx'),
  'utf8',
);

describe('IMPCG UI — o que o TestSprite faria no popup (AC-017, FR-006)', () => {
  it('total do ofício é editável à vista (Salvar total + BRL)', () => {
    expect(pageClient).toMatch(/Salvar total/);
    expect(pageClient).toMatch(/placeholder=["']12\.550,00["']/);
    expect(pageClient).toMatch(/aria-label=["']Total do ofício["']/);
    expect(itemsEditor).toMatch(/Salvar total/);
    expect(itemsEditor).toMatch(/onSaveTotal/);
    expect(pageClient).not.toMatch(/placeholder=["']12550\.00["']/);
  });

  it('não pede CRM no editor de médico', () => {
    expect(pageClient).not.toMatch(/placeholder=["']CRM["']/);
    expect(pageClient).not.toMatch(/setCrmDraft/);
    expect(pageClient).toMatch(/doctorName: doctorDraft\.trim\(\)/);
    expect(pageClient).not.toMatch(/doctorCrm:\s*crmDraft/);
  });

  it('viewer não vê controles de edição', () => {
    expect(pageClient).toMatch(/detail\.canEdit/);
    expect(itemsEditor).toMatch(/canEdit/);
    expect(pageClient).toMatch(/if \(!detail\?\.canEdit \|\| !selectedId\) return/);
  });

  it('CRM ausente não vira falta nem parcial', () => {
    const row = {
      parseStatus: 'parcial' as const,
      oficioNumber: '1589',
      issuedAt: new Date('2023-08-10T00:00:00.000Z'),
      patientName: 'PAULO ROBERTO LOUREIRO PINHEIRO',
      doctorName: 'ARINO FARIA DA SILVA',
      doctorCrm: null,
      procedureName: 'TROCA VALVAR',
      hospitalName: 'HOSPITAL EL KADRI',
      totalCents: 1000,
      items: [{ lineCents: 1000 }],
    };
    expect(presentImpcgReadStatus(row)).toEqual({ parseStatus: 'ok', parseMissingReason: null });
    expect(describeImpcgParseGap({ ...row, parseStatus: 'ok' })).toBeNull();
  });
});
