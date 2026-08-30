import { Decimal } from '@prisma/client-runtime-utils';
import { describe, expect, it } from 'vitest';
import { describeImpcgParseGap, parseOficio } from '@/lib/impcg/parse-oficio';

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
    expect(describeImpcgParseGap(parsed)).toBeNull();
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
    expect(describeImpcgParseGap(parsed)).toBe('Não foi possível ler o documento');
  });

  it('lê o OCR real do scan 17673 (TOTAL R$, R$ nas linhas, médico+CRM)', () => {
    const ocr = `
ORDEM DE FORNECIMENTO Nº 17673
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MATRÍCULA: 66429737-4
MÉDICO : RODRIGO LUIZ ROCHA CARDOSO CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR
1 80102510935 |KIT VALVULA AORTICA MECANICA SORIN As 1 R$ 6.500,00 R$ 6.500,00
8138739901 |KIT CEC EUROSETS AGS214 1 | R$5.500,00 R$ 5.500,00
3 | 10196320037 |KIT CANULAS ARTERIAL E VENOSA BIOMEDICAL KITPER 1 R$ 550,00 R$ 550,00
TOTAL R$ 12.550,00)
`.trim();
    const parsed = parseOficio(ocr, 'OFICIO 17673 PLINIO ANTONIO ARANHA JUNIOR');
    expect(parsed.oficioNumber).toBe('17673');
    expect(parsed.patientName).toBe('PLINIO ANTONIO ARANHA JUNIOR');
    expect(parsed.doctorName).toBe('RODRIGO LUIZ ROCHA CARDOSO');
    expect(parsed.doctorCrm).toBe('13716');
    expect(parsed.procedureName).toBe('TROCA VALVAR');
    expect(parsed.hospitalName).toBe('HOSPITAL PRONCOR');
    expect(parsed.totalCents).toBe(1255000);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items.map((item) => item.lineCents)).toEqual([650000, 550000, 55000]);
    expect(new Decimal(parsed.totalCents ?? 0).div(100).toFixed(2)).toBe('12550.00');
    expect(parsed.issuedAt).toBeNull();
    expect(parsed.parseStatus).toBe('parcial');
    expect(describeImpcgParseGap(parsed)).toBe('Faltou: data');
  });

  it('lê a data mesmo com OCR trocando O/0 e hífen', () => {
    const ocr = `
ORDEM DE FORNECIMENTO Nº 17673
DATA: 1O/O8/2O23
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR
KIT VALVULA AORTICA MECANICA SORIN A5 1 6.500,00 6.500,00
KIT CEC EUROSETS AG5214 1 5.500,00 5.500,00
KIT CANULAS BIOMEDICAL KITPER 1 550,00 550,00
TOTAL R$ 12.550,00
`.trim();
    const parsed = parseOficio(ocr);
    expect(parsed.issuedAt?.toISOString().slice(0, 10)).toBe('2023-08-10');
    expect(parsed.parseStatus).toBe('ok');
  });

  it('usa a data de fechamento, não a da OBS de urgência (ofício 16404)', () => {
    const parsed = parseOficio(`
INSTITUTO MUNICIPAL DE PREVIDENCIA DE CAMPO GRANDE
ORDEM DE FORNECIMENTO N 16404
PACIENTE: MARA MARCIA FERNANDES DE MORAES
MEDICO: CLAUDIO ALBERNAZ CESAR
CRM: 3947
PROCEDIMENTO: REVASCULARIZACAO DO MIOCARDIO
LOCAL DE ENTREGA: HOSPITAL CLINICA CAMPO GRANDE
KIT TESTE MARCA REF 1 3.350,00 3.350,00
TOTAL GERAL: 3.350,00
OBS: PROCEDIMENTO REALIZADO NA URGENCIA EM 18/12/2025
Campo Grande, 22 de janeiro de 2026.
`);
    expect(parsed.issuedAt?.toISOString().slice(0, 10)).toBe('2026-01-22');
  });

  it('lê Campo Grande (MS), DD/MM/AAAA depois do timbre', () => {
    const parsed = parseOficio(`
IMPCG CAMPO GRANDE
ORDEM DE FORNECIMENTO N 17742
PACIENTE: LURDES DA SILVA CACERES
KIT TESTE MARCA REF 1 10,00 10,00
TOTAL GERAL: 10,00
OBS: PROCEDIMENTO REALIZADO NA URGENCIA EM 22/06/2026.
Campo Grande (MS), 21/08/2026
`);
    expect(parsed.issuedAt?.toISOString().slice(0, 10)).toBe('2026-08-21');
  });

  it('lê data por extenso (Campo Grande, 10 de agosto de 2023)', () => {
    const parsed = parseOficio(`
ORDEM DE FORNECIMENTO N 17673
Campo Grande, 10 de agosto de 2023
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR
KIT VALVULA AORTICA MECANICA SORIN A5 1 6.500,00 6.500,00
KIT CEC EUROSETS AG5214 1 5.500,00 5.500,00
KIT CANULAS BIOMEDICAL KITPER 1 550,00 550,00
TOTAL GERAL: 12.550,00
`);
    expect(parsed.issuedAt?.toISOString().slice(0, 10)).toBe('2023-08-10');
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
    expect(describeImpcgParseGap(parsed)).toContain('soma dos itens ≠ total');
  });

  it('lista os campos vazios no texto de parcial', () => {
    const parsed = parseOficio(`
ORDEM DE FORNECIMENTO N 100
DATA: 10/08/2023
PACIENTE: JOAO SILVA
CRM: 12345
PROCEDIMENTO: EXAME
KIT TESTE  MARCA  REF  1  10,00  10,00
TOTAL GERAL: 10,00
`);
    expect(parsed.parseStatus).toBe('parcial');
    expect(describeImpcgParseGap(parsed)).toBe('Faltou: médico, hospital');
  });

  it('menciona só os totais quando o cabeçalho está completo (FAIL-004)', () => {
    const parsed = parseOficio(`
ORDEM DE FORNECIMENTO N 99
DATA: 10/08/2023
PACIENTE: JOAO SILVA
MEDICO: DR TESTE
CRM: 123
PROCEDIMENTO: EXAME
LOCAL DE ENTREGA: HOSPITAL X
KIT TESTE  MARCA  REF  1  10,00  10,00
TOTAL GERAL: 20,00
`);
    expect(parsed.parseStatus).toBe('parcial');
    expect(describeImpcgParseGap(parsed)).toBe('Faltou: soma dos itens ≠ total');
  });
});
