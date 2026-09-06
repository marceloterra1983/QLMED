import { describe, expect, it } from 'vitest';
import { parseBeneficiarioFromPortalText } from '@/lib/unimed-cg/opme-portal';

describe('opme-portal Beneficiário extract', () => {
  it('extrai nome em maiúsculas antes da carteirinha', () => {
    const text =
      'Solicitação / Processo: 75576 Beneficiário Sem Pontuação Enviar certificado de rastreabilidade '
      + 'Direitos do Paciente DIEGO ABEL DA SILVA 0051-0030-086726-00-0 Médico solicitante';
    expect(parseBeneficiarioFromPortalText(text)).toBe('DIEGO ABEL DA SILVA');
  });

  it('retorna null sem padrão de carteirinha', () => {
    expect(parseBeneficiarioFromPortalText('Beneficiário Sem Pontuação')).toBeNull();
  });
});
