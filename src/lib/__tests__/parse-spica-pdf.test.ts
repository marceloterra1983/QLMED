import { describe, expect, it } from 'vitest';
import { parseQuotePdfText } from '../orcamentos/parse-spica-pdf';

const LUIZ = `
                                         QL MED MATERIAIS HOSPITALARES LTDA
                                         CNPJ: 07.832.309/0001-97 - Insc. Estadual: 28.337.918-9                                                                  Data:        15/09/2026                     Pag.        1
                                                                                                                   ORÇAMENTO
No. :                00008318                            Data:             15/09/2026       Cliente:   INSTITUTO DE ASSISTENCIA A SAUDE DOS SERVIDORES DO ESTADO D                           Cód.:   00571
CNPJ.:               05.794.356/0001-68                        Inscr. Est.:        ISENTO                                                                        Vendedor:         ____
Ítem Código                              Descrição                                                                                         R.V.S.          NCM        Un.      Qtde.       Pr. Un.   Desc.           Total
 001 4326202                             KIT AUTOTRANSFUSÃO X-TRA 225                                                                      80102511537     90183929   UN           1      3.800,00               3.800,00
                                                                                                                                                                          Sub-Total:                             3.800,00
                                                                                                                                                                              Frete:                                  0,00
                                                                                        Paciente :     LUIZ CARLOS DE ALMEIDA
 Médico :                     Paulo Ruiz                                                Convênio :     MT SAUDE - 007                                                         Total:                             3.800,00
                                                               Local:        AMECOR ASSIST MEDICA CARDIOL LTDA
 Obs:                         (DADOS CONTA CORRENTE: BANCO BRASIL, AG: 2936-X, C/C: 119.005-9)
 Atenciosamente,
SPICA (H020_L_Orcamento_P.RPT)
`;

const MARIA = `
                                                                      ORÇAMENTO
Cliente:      CAIXA DE ASSISTENCIA DOS SERVIDORES DO ESTADO DO MATO GROSSO DO SUL - CASSEMS
CNPJ:         04.311.093/0001-26
DATA:    12/01/2022
Código       ITEM                                                             FABRICANTE      ANVISA      QTDE   VL. UNITÁRIO         TOTAL
93.99.2447   CANULA PARA RADIOFREQUENCIA 21MM 150MM                               BRAMSYS   80195520024    6         4.500,00     27.000,00
Forma de Pagamento: 60 dias                                                                                      Valor Total:     27.000,00
OBSERVAÇÕES: UTILIZADO NO PACIENTE: MARIA DE FATIMA EUGENIO PEREIRA
Atenciosamente,
FLAVIO - flavio@qlmed.com.br
MARCELO - marcelo@qlmed.com.br
`;

const ALCEU = `
                                                                                                                    ORÇAMENTO
No. :                00001786                            Data:             19/02/2016       Cliente:   FUNDACAO ASSISTENCIAL DOS SERVID. DO MINISTERIO DA FA                                Cód.:     00375
CNPJ.:               00.628.107/0018-27                        Inscr. Est.:        ISENTO                                                                   Vendedor:
Ítem Código                                Descrição                                                               Fabricante                      R.V.S.          Un.    Qtde.        Pr. Un.       Desc.            Total
 001 65100 1                               FILTRO DE VEIA CAVA (ELLA-CS)                                           ELLA-CS                         10407990002     UN          1      6.000,00                     6.000,00
                                                                                                                                                                         Sub-Total:                                6.000,00
                                                                                                                                                                             Frete:                                    0,00
                                                                                                                                                                             Total:                                6.000,00
                                                                                        Local:         FUNDACAO ASSISTENCIAL DOS SERVID. DO MINIST
 Obs:                         PACIENTE: ALCEU BRANDAO
SPICA (H020_L_Orcamento_P.RPT)
`;

describe('parseQuotePdfText', () => {
  it('lê o H020 do Luiz Carlos (número, item, totais, clínico)', () => {
    const parsed = parseQuotePdfText(LUIZ);
    expect(parsed?.layout).toBe('h020');
    expect(parsed?.numberLabel).toBe('00008318');
    expect(parsed?.issuedAt).toBe('2026-09-15');
    expect(parsed?.customerCnpj).toBe('05794356000168');
    expect(parsed?.patientName).toMatch(/LUIZ CARLOS DE ALMEIDA/);
    expect(parsed?.convenio).toMatch(/MT SAUDE/);
    expect(parsed?.local).toMatch(/AMECOR/);
    expect(parsed?.items[0]?.code).toBe('4326202');
    expect(parsed?.items[0]?.unitPrice).toBe('3800.00');
    expect(parsed?.total).toBe('3800.00');
  });

  it('lê o modelo simples da Maria de Fátima', () => {
    const parsed = parseQuotePdfText(MARIA);
    expect(parsed?.layout).toBe('simples');
    expect(parsed?.issuedAt).toBe('2022-01-12');
    expect(parsed?.customerCnpj).toBe('04311093000126');
    expect(parsed?.patientName).toMatch(/MARIA DE FATIMA/);
    expect(parsed?.items[0]?.code).toBe('93.99.2447');
    expect(parsed?.total).toBe('27000.00');
    expect(parsed?.salesperson).toMatch(/FLAVIO/i);
  });

  it('usa Total: quando o modelo simples não tem Valor Total', () => {
    const parsed = parseQuotePdfText(`
                                                                      ORÇAMENTO
Cliente:      HOSPITAL EXEMPLO
CNPJ:         04.311.093/0001-26
DATA:    12/01/2022
93.99.2447   CANULA TESTE                               BRAMSYS   80195520024    1         100,00        100,00
Total:     100,00
`);
    expect(parsed?.total).toBe('100.00');
    expect(parsed?.subtotal).toBe('100.00');
  });

  it('não grava o CNPJ da QL MED como cliente', () => {
    const parsed = parseQuotePdfText(`
                                         QL MED MATERIAIS HOSPITALARES LTDA
                                         CNPJ: 07.832.309/0001-97
                                                                                                                    ORÇAMENTO
No. :                00000001                            Data:             19/02/2016       Cliente:   HOSPITAL SEM CNPJ                                                 Cód.:     00001
Ítem Código                                Descrição                                                               Fabricante                      R.V.S.          Un.    Qtde.        Pr. Un.       Desc.            Total
 001 1                                     ITEM                                                                    X                               10407990002     UN          1      1,00                         1,00
                                                                                                                                                                             Total:                                    1,00
SPICA (H020_L_Orcamento_P.RPT)
`);
    expect(parsed?.customerCnpj).toBeNull();
  });

  it('lê H020 antigo com fabricante no lugar de NCM', () => {
    const parsed = parseQuotePdfText(ALCEU);
    expect(parsed?.numberLabel).toBe('00001786');
    expect(parsed?.customerCnpj).toBe('00628107001827');
    expect(parsed?.total).toBe('6000.00');
    expect(parsed?.items[0]?.rvs).toBe('10407990002');
  });

  it('recusa PDF que não é orçamento', () => {
    expect(parseQuotePdfText('DANFE NF-e 123')).toBeNull();
  });
});
