import { Decimal } from '@prisma/client-runtime-utils';
import { describe, expect, it } from 'vitest';
import { parseOficio } from '@/lib/impcg/parse-oficio';

/** Texto injetado no formato do OCR da ordem 17673 (scan Brother). */
export const OFICIO_17673_TEXT = `
INSTITUTO MUNICIPAL DE PREVIDENCIA DE CAMPO GRANDE
ORDEM DE FORNECIMENTO N 17673
DATA: 10/08/2023

PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MATRICULA: 66429737-4
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR

ITENS APROVADOS
DESCRICAO                              MARCA       REF      QTD   UNITARIO     TOTAL
KIT VALVULA AORTICA MECANICA           SORIN       A5         1    6.500,00    6.500,00
KIT CEC                                EUROSETS    AG5214     1    5.500,00    5.500,00
KIT CANULAS                            BIOMEDICAL  KITPER     1      550,00      550,00

TOTAL GERAL: 12.550,00
`.trim();

describe('parseOficio fixture 17673', () => {
  it('extrai cabeçalho, três itens e 1.255.000 centavos', () => {
    const parsed = parseOficio(OFICIO_17673_TEXT, 'OF 17673 PLINIO ANTONIO ARANHA JUNIOR');

    expect(parsed.oficioNumber).toBe('17673');
    expect(parsed.issuedAt?.toISOString().slice(0, 10)).toBe('2023-08-10');
    expect(parsed.patientName).toBe('PLINIO ANTONIO ARANHA JUNIOR');
    expect(parsed.patientRegistry).toBe('66429737-4');
    expect(parsed.doctorName).toBe('RODRIGO LUIZ ROCHA CARDOSO');
    expect(parsed.doctorCrm).toBe('13716');
    expect(parsed.procedureName).toBe('TROCA VALVAR');
    expect(parsed.hospitalName).toBe('HOSPITAL PRONCOR');
    expect(parsed.totalCents).toBe(1255000);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({
      description: 'KIT VALVULA AORTICA MECANICA',
      brand: 'SORIN',
      reference: 'A5',
      quantity: '1',
      unitCents: 650000,
      lineCents: 650000,
    });
    expect(parsed.items[1]).toMatchObject({
      description: 'KIT CEC',
      brand: 'EUROSETS',
      reference: 'AG5214',
      quantity: '1',
      unitCents: 550000,
      lineCents: 550000,
    });
    expect(parsed.items[2]).toMatchObject({
      description: 'KIT CANULAS',
      brand: 'BIOMEDICAL',
      reference: 'KITPER',
      quantity: '1',
      unitCents: 55000,
      lineCents: 55000,
    });
    const itemSum = parsed.items.reduce((sum, item) => sum + item.lineCents, 0);
    expect(itemSum).toBe(1255000);
    expect(parsed.parseStatus).toBe('ok');
    expect(new Decimal(parsed.totalCents ?? 0).div(100).toFixed(2)).toBe('12550.00');
    expect(typeof parsed.totalCents).toBe('number');
    expect(Number.isInteger(parsed.totalCents)).toBe(true);
  });

  it('prefere o paciente do documento ao do assunto (AC-009)', () => {
    const parsed = parseOficio(OFICIO_17673_TEXT, 'Ordem 17673 MARIA SILVA');
    expect(parsed.patientName).toBe('PLINIO ANTONIO ARANHA JUNIOR');
  });

  it('usa o paciente do assunto quando o documento não tem nome', () => {
    const parsed = parseOficio('ORDEM DE FORNECIMENTO N 17673\nTOTAL GERAL: 12.550,00', 'OF 17673 MARIA SILVA');
    expect(parsed.patientName).toBe('MARIA SILVA');
    expect(parsed.parseStatus).toBe('parcial');
  });

  it('não inventa totais quando o texto é ilegível (FAIL-003)', () => {
    const parsed = parseOficio('', 'assunto sem numero');
    expect(parsed.oficioNumber).toBeNull();
    expect(parsed.totalCents).toBeNull();
    expect(parsed.items).toEqual([]);
    expect(parsed.parseStatus).toBe('falha');
    expect(parsed.patientName).toBe('PACIENTE');
  });

  it('marca parcial quando a soma dos itens diverge do total (FAIL-004)', () => {
    const parsed = parseOficio(`
ORDEM DE FORNECIMENTO N 99
PACIENTE: JOAO
KIT TESTE  MARCA  REF  1  10,00  10,00
TOTAL GERAL: 20,00
`);
    expect(parsed.totalCents).toBe(2000);
    expect(parsed.items[0]?.lineCents).toBe(1000);
    expect(parsed.parseStatus).toBe('parcial');
  });
});
