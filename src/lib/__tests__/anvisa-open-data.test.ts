import { describe, expect, it } from 'vitest';
import { parseHeader } from '@/lib/anvisa-open-data';

// Cabeçalhos reais dos CSVs de dados abertos da ANVISA (09/2026).
const MEDICAMENTOS_HEADER = [
  'NU_PROCESSO',
  'CO_TIPO_PRODUTO',
  'NO_RAZAO_SOCIAL_EMPRESA',
  'DT_VENCIMENTO_PRODUTO',
  'VENCIMENTO_MES_ANO',
  'NU_CNPJ_EMPRESA',
  'NO_PRODUTO',
  'VENCIMENTO',
  'NU_REGISTRO_PRODUTO',
  'CO_SEQ_PRODUTO',
  'ST_ROTULO',
  'CO_SITUACAO_ASSUNTO_DOC',
  'TP_GRAU',
  'ORDEM',
  'DATA_PUBLICACAO',
  'CO_SEQ_TIPO_CAT_REGULATORIA',
  'DS_TIPO_CATEGORIA_REGULATORIA',
  'DS_REFERENCIA',
  'CO_SEQ_TIPO_PRIORIZACAO',
  'NO_TIPO_PRIORIZACAO',
  'DS_PRODUTO_NOTIFICADO',
  'CO_CATEGORIA_PRODUTO',
  'TIPO_AUTORIZACAO',
  'CO_SEQ_NOTIFICACAO',
  'SINONIMOS',
  'INDICACOES',
  'TP_SITUACAO_APRESENTACAO',
  'DATA_CANCELAMENTO',
  'DT_INICIO_ANALISE',
  'CO_ATC',
  'CO_SUBSTANCIA',
  'CO_TIPO_CAT_REGULATORIA',
  'CO_FORMA_FISICA',
  'CO_RESTRICAO',
  'CO_TARJA',
  'CO_SEQ_APRESENTACAO_PRODUTO',
  'ST_DISPENSA_FRACIONADA',
  'COMPLEMENTO',
  'AUTORIZACAO_MEDICAMENTO',
  'SITUACAO_ASSUNTO',
  'SUBSTANCIAS_MEDICAMENTOS',
  'VALIDADE_SITUACAO',
  'NUMERO_APRESENTACOES',
  'DATA_ULTIMA_ATUALIZACAO',
  'DT_CARGA_ETL',
];

const PRODUTOS_SAUDE_HEADER = [
  'NU_PROCESSO',
  'NO_RAZAO_SOCIAL_EMPRESA',
  'NU_CNPJ_EMPRESA',
  'NO_PRODUTO',
  'NU_REGISTRO_PRODUTO',
  'CO_SEQ_PRODUTO',
  'CO_SITUACAO_ASSUNTO_DOC',
  'DT_PUBLICACAO',
  'DS_SITUACAO_ASSUNTO_DOC',
  'DT_VENCIMENTO_PRODUTO',
  'NU_RESOLUCAO',
  'DS_MOTIVO',
  'CO_SEQ_SITUACAO_PRODUTO',
  'TP_SITUACAO_PRODUTO',
  'CANCELAMENTO',
  'DT_CANCELAMENTO',
  'DT_INICIO_VIGENCIA',
  'SG_RISCO_PRODUTO',
  'TIPOASSUNTO',
  'DS_OBSERVACAO',
  'CO_TIPO_PRODUTO',
  'DT_VENCIMENTO_REGISTRO',
  'SITUACAO_REGISTRO',
  'DT_CARGA_ETL',
];

describe('parseHeader (anvisa-open-data)', () => {
  it('reconhece NO_PRODUTO no CSV atual de medicamentos', () => {
    const h = parseHeader(MEDICAMENTOS_HEADER);
    expect(h).not.toBeNull();
    expect(MEDICAMENTOS_HEADER[h!.productNameIndex]).toBe('NO_PRODUTO');
    expect(MEDICAMENTOS_HEADER[h!.registrationIndex]).toBe('NU_REGISTRO_PRODUTO');
    expect(MEDICAMENTOS_HEADER[h!.holderIndex]).toBe('NO_RAZAO_SOCIAL_EMPRESA');
    expect(MEDICAMENTOS_HEADER[h!.processIndex]).toBe('NU_PROCESSO');
    expect(MEDICAMENTOS_HEADER[h!.statusIndex]).toBe('VALIDADE_SITUACAO');
  });

  it('reconhece NO_PRODUTO e SITUACAO_REGISTRO no CSV atual de produtos para saúde', () => {
    const h = parseHeader(PRODUTOS_SAUDE_HEADER);
    expect(h).not.toBeNull();
    expect(PRODUTOS_SAUDE_HEADER[h!.productNameIndex]).toBe('NO_PRODUTO');
    expect(PRODUTOS_SAUDE_HEADER[h!.registrationIndex]).toBe('NU_REGISTRO_PRODUTO');
    expect(PRODUTOS_SAUDE_HEADER[h!.holderIndex]).toBe('NO_RAZAO_SOCIAL_EMPRESA');
    // Não pode cair na coluna genérica CO_SITUACAO_ASSUNTO_DOC, que vem antes.
    expect(PRODUTOS_SAUDE_HEADER[h!.statusIndex]).toBe('SITUACAO_REGISTRO');
  });

  it('continua aceitando o nome antigo NOME_PRODUTO', () => {
    const h = parseHeader(['NOME_PRODUTO', 'NU_REGISTRO_PRODUTO', 'EMPRESA', 'SITUACAO_REGISTRO']);
    expect(h).not.toBeNull();
    expect(h!.productNameIndex).toBe(0);
    expect(h!.registrationIndex).toBe(1);
  });

  it('não reconhece um header sem coluna de nome de produto', () => {
    expect(parseHeader(['NU_REGISTRO_PRODUTO', 'EMPRESA', 'STATUS'])).toBeNull();
  });
});
