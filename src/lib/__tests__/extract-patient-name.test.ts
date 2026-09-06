import { describe, expect, it } from 'vitest';
import {
  extractInfCpl,
  extractPatientNameFromInfCpl,
  extractPatientNameFromXml,
} from '@/lib/nfe/extract-patient-name';

describe('extractPatientNameFromInfCpl', () => {
  it('extrai nome simples', () => {
    expect(
      extractPatientNameFromInfCpl(
        '(Paciente JOAO ANTONIO DA SILVA) (Convenio CASSEMS) (Medico Roberto)',
      ),
    ).toBe('JOAO ANTONIO DA SILVA');
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
});

describe('extractPatientNameFromXml', () => {
  it('lê do XML', () => {
    const xml = `<nfeProc><infAdic><infCpl>(Paciente RAUL VEDOVATO) (Convenio UNIMED)</infCpl></infAdic></nfeProc>`;
    expect(extractPatientNameFromXml(xml)).toBe('RAUL VEDOVATO');
    expect(extractInfCpl(xml)).toContain('RAUL VEDOVATO');
  });
});
