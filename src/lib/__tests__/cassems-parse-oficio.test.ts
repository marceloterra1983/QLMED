import { readFileSync } from 'node:fs';
import { Decimal } from '@prisma/client-runtime-utils';
import { describe, expect, it } from 'vitest';
import { describeCassemsParseGap, oficioFromFileName, parseOficio } from '@/lib/cassems/parse-oficio';

/** Texto real do pdftotext -layout do ofício modelo (autorização 2479325231). */
export const OFICIO_2479325231_TEXT = `
                       Oficio de materiais OPME



                                        Número de autorização: 2479325231

 Autorizamos para o(a) paciente DOUGLAS BARBOSA FELIPE, matrícula 0010291552010120, guia de TISS - RESUMO DE
INTERNACAO, material orçado e abaixo relacionado, que será utilizado no(s) procedimento(s):
3.09.99.014-Revascularização do miocárdio sem C.E.C.;

Item    TUSS      Código Unid.         Descrição do material                          Nº ANVISA Vlr Unit. R$         Total R$
  2   93.99.1425 93.99.1425 3 SHUNT CORONARIO                                        10166360035   520,00            1.560,00
                               KIT DE ASPIRACAO E COLETA DE
     0036212123 0036212123
  1                         1 SANGUE AUTOTRANSFUSAO - REF.                           80102511537      3.200,00       3.200,00
          23         23
                               04257 - SORIN

                                                                                             Total sem desconto   R$ 4.760,00
                                                                                                      Desconto    R$ 0,00
                                                                                      Valor total com desconto    R$ 4.760,00

LOCAL DE EXECUÇÃO: HOSPITAL CASSEMS UNIDADE DE CAMPO GRANDE
PRESTADOR SOLICITANTE: ISMAEL ESCOBAR CAPIATRA                                                                            Nº CRM:


Colocamo-nos à disposição para quaisquer esclarecimentos.
Cordialmente,
                                                 Serviços OPME Anexo
                                                 OPME/CASSEMS




AO
QL MED MATERIAIS HOSPITALARES LTDA

Usuário: services.opmeanexo
Número do Fornecimento: 247932523




                                              Campo Grande / MS - Data/hora: 28/08/2026 13:31:30                  Pág.1
`.trim();

const MODEL_FILE =
  'CASSEMS001 - Oficio de materiais OPME autorizados 28-08-2026-133128021.pdf';

describe('parseOficio fixture 2479325231 (PDF real CASSEMS)', () => {
  it('extrai cabeçalho, dois itens e 476.000 centavos', () => {
    const parsed = parseOficio(OFICIO_2479325231_TEXT, MODEL_FILE);

    expect(parsed.oficioNumber).toBe('2479325231');
    expect(parsed.issuedAt?.toISOString().slice(0, 10)).toBe('2026-08-28');
    expect(parsed.patientName).toBe('DOUGLAS BARBOSA FELIPE');
    expect(parsed.patientRegistry).toBe('0010291552010120');
    expect(parsed.doctorName).toBe('ISMAEL ESCOBAR CAPIATRA');
    expect(parsed.hospitalName).toBe('HOSPITAL CASSEMS UNIDADE DE CAMPO GRANDE');
    expect(parsed.procedureName).toMatch(/REVASCULARIZA/);
    expect(parsed.totalCents).toBe(476000);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      description: 'SHUNT CORONARIO',
      anvisaCode: '10166360035',
      quantity: '3',
      unitCents: 52000,
      lineCents: 156000,
    });
    expect(parsed.items[1]).toMatchObject({
      anvisaCode: '80102511537',
      quantity: '1',
      unitCents: 320000,
      lineCents: 320000,
      brand: 'SORIN',
      reference: '04257',
    });
    expect(parsed.items[1].description).toMatch(/ASPIRACAO/);
    expect(parsed.items[1].description).toMatch(/AUTOTRANSFUSAO/);
    const itemSum = parsed.items.reduce((sum, item) => sum + item.lineCents, 0);
    expect(itemSum).toBe(476000);
    expect(parsed.parseStatus).toBe('ok');
    expect(describeCassemsParseGap(parsed)).toBeNull();
    expect(new Decimal(parsed.totalCents ?? 0).div(100).toFixed(2)).toBe('4760.00');
    expect(Number.isInteger(parsed.totalCents)).toBe(true);
  });

  it('não usa o carimbo 133128021 do nome do arquivo como autorização', () => {
    expect(oficioFromFileName(MODEL_FILE)).toBeNull();
    const parsed = parseOficio(OFICIO_2479325231_TEXT, MODEL_FILE);
    expect(parsed.oficioNumber).toBe('2479325231');
    expect(parsed.oficioNumber).not.toBe('133128021');
    expect(parsed.oficioNumber).not.toBe('001');
  });

  it('prefere o paciente do documento ao do assunto (AC-009)', () => {
    const parsed = parseOficio(OFICIO_2479325231_TEXT, 'CASSEMS 2479325231 MARIA SILVA');
    expect(parsed.patientName).toBe('DOUGLAS BARBOSA FELIPE');
  });

  it('usa o paciente do assunto quando o documento não tem nome', () => {
    const parsed = parseOficio(
      'Número de autorização: 2479325231\nValor total com desconto R$ 4.760,00',
      'CASSEMS 2479325231 MARIA SILVA',
    );
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
    expect(describeCassemsParseGap(parsed)).toBe('Não foi possível ler o documento');
  });

  it('marca parcial quando a soma dos itens diverge do total (FAIL-004)', () => {
    const parsed = parseOficio(`
Número de autorização: 2479000001
paciente JOAO SILVA, matrícula 1
10166360035   520,00            1.560,00
Valor total com desconto    R$ 9.999,00
`);
    expect(parsed.totalCents).toBe(999900);
    expect(parsed.items[0]?.lineCents).toBe(156000);
    expect(parsed.parseStatus).toBe('parcial');
    expect(describeCassemsParseGap(parsed)).toContain('soma dos itens ≠ total');
  });

  it('lista os campos vazios no texto de parcial', () => {
    expect(describeCassemsParseGap({
      parseStatus: 'parcial',
      oficioNumber: '2479000002',
      issuedAt: new Date('2026-08-28T00:00:00.000Z'),
      patientName: 'JOAO SILVA',
      doctorName: null,
      doctorCrm: '12345',
      procedureName: 'EXAME',
      hospitalName: null,
      totalCents: 1000,
      items: [{ lineCents: 1000 }],
    })).toBe('Faltou: médico, hospital');
  });

  it('menciona só os totais quando o cabeçalho está completo (FAIL-004)', () => {
    expect(describeCassemsParseGap({
      parseStatus: 'parcial',
      oficioNumber: '2479000003',
      issuedAt: new Date('2026-08-28T00:00:00.000Z'),
      patientName: 'JOAO SILVA',
      doctorName: 'DR TESTE',
      doctorCrm: '123',
      procedureName: 'EXAME',
      hospitalName: 'HOSPITAL X',
      totalCents: 2000,
      items: [{ lineCents: 1000 }],
    })).toBe('Faltou: soma dos itens ≠ total');
  });

  it('lê o texto extraído do PDF em /tmp quando o arquivo existir', () => {
    let diskText = '';
    try {
      diskText = readFileSync('/tmp/cassems-modelo.txt', 'utf8');
    } catch {
      return;
    }
    if (diskText.trim().length < 80) return;
    const parsed = parseOficio(diskText, MODEL_FILE);
    expect(parsed.oficioNumber).toBe('2479325231');
    expect(parsed.totalCents).toBe(476000);
    expect(parsed.items).toHaveLength(2);
  });
});
