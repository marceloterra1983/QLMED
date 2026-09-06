import { describe, expect, it } from 'vitest';
import {
  extractConvenioNameFromInfCpl,
  extractDoctorNameFromInfCpl,
  extractInfCpl,
  extractPatientNameFromInfCpl,
  extractPatientNameFromXml,
} from '@/lib/nfe/extract-patient-name';

const SAMPLE =
  '(Paciente JOAO ANTONIO DA SILVA) (Convenio CASSEMS) (Medico Roberto Luis Favero)';

describe('extractPatientNameFromInfCpl', () => {
  it('extrai nome simples', () => {
    expect(extractPatientNameFromInfCpl(SAMPLE)).toBe('JOAO ANTONIO DA SILVA');
  });

  it('é case-insensitive e normaliza espaços', () => {
    expect(extractPatientNameFromInfCpl('(paciente   Maria   Pedraza  Lopes)')).toBe(
      'MARIA PEDRAZA LOPES',
    );
  });

  it('remove sufixo ATEND.', () => {
    expect(
      extractPatientNameFromInfCpl(
        '(Paciente ADEMAR DE AGUIAR BORBA  - ATEND.: 6399755) (Convenio SUS)',
      ),
    ).toBe('ADEMAR DE AGUIAR BORBA');
  });

  it('retorna null sem Paciente', () => {
    expect(extractPatientNameFromInfCpl('(Ped. Vda. 0000047422) ENTREGA PARCIAL')).toBeNull();
  });

  it('retorna null com um único token', () => {
    expect(extractPatientNameFromInfCpl('(Paciente JOAO)')).toBeNull();
  });

  it('normaliza pipe de quebra de linha no XML', () => {
    expect(
      extractPatientNameFromInfCpl('(Paciente JOAO ANTONIO|DA SILVA) (Convenio CASSEMS)'),
    ).toBe('JOAO ANTONIO DA SILVA');
  });
});

describe('extractConvenioNameFromInfCpl', () => {
  it('extrai convênio', () => {
    expect(extractConvenioNameFromInfCpl(SAMPLE)).toBe('CASSEMS');
  });

  it('aceita nome composto', () => {
    expect(extractConvenioNameFromInfCpl('(Convenio UNIMED CUIABA)')).toBe('UNIMED CUIABA');
  });

  it('normaliza pipe', () => {
    expect(extractConvenioNameFromInfCpl('(Convenio BRADESCO|SAUDE)')).toBe('BRADESCO SAUDE');
  });

  it('retorna null sem Convenio', () => {
    expect(extractConvenioNameFromInfCpl('(Paciente JOAO DA SILVA)')).toBeNull();
  });
});

describe('extractDoctorNameFromInfCpl', () => {
  it('extrai médico', () => {
    expect(extractDoctorNameFromInfCpl(SAMPLE)).toBe('ROBERTO LUIS FAVERO');
  });

  it('aceita um único token', () => {
    expect(extractDoctorNameFromInfCpl('(Medico ASTON)')).toBe('ASTON');
  });

  it('remove dois-pontos e pipe', () => {
    expect(
      extractDoctorNameFromInfCpl('(Medico : RAFAEL TIBYRICA LOUREIRO DA|ROSA)'),
    ).toBe('RAFAEL TIBYRICA LOUREIRO DA ROSA');
  });

  it('retorna null para placeholder', () => {
    expect(extractDoctorNameFromInfCpl('(Medico -)')).toBeNull();
  });

  it('aceita acentuação em Médico', () => {
    expect(extractDoctorNameFromInfCpl('(Médico Paulo Ruiz)')).toBe('PAULO RUIZ');
  });
});

describe('extractPatientNameFromXml', () => {
  it('lê do XML', () => {
    const xml = `<nfeProc><infAdic><infCpl>(Paciente RAUL VEDOVATO) (Convenio UNIMED)</infCpl></infAdic></nfeProc>`;
    expect(extractPatientNameFromXml(xml)).toBe('RAUL VEDOVATO');
    expect(extractInfCpl(xml)).toContain('RAUL VEDOVATO');
    expect(extractConvenioNameFromInfCpl(extractInfCpl(xml))).toBe('UNIMED');
  });
});
