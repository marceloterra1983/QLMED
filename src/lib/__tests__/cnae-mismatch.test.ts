import { describe, it, expect } from 'vitest';
import { checkCnaeMismatch } from '@/components/contact-details/cnae-mismatch';

describe('checkCnaeMismatch', () => {
  it('não avisa sem CNAE ou sem tipos de produto', () => {
    expect(checkCnaeMismatch(null, null, ['VALVULA'])).toBeNull();
    expect(checkCnaeMismatch('4645-1/01', 'Comércio de instrumentos médicos', [])).toBeNull();
  });

  it('não avisa quando o CNAE médico bate com os tipos vendidos', () => {
    expect(checkCnaeMismatch('4645-1/01', null, ['VALVULA CARDIACA'])).toBeNull();
    expect(checkCnaeMismatch(null, 'Comércio de instrumentos cirúrgicos', ['CATETER'])).toBeNull();
  });

  it('avisa quando o CNAE médico não bate com os tipos vendidos', () => {
    const warning = checkCnaeMismatch('4645-1/01', null, ['ARROZ', 'FEIJAO']);
    expect(warning).toContain('instrumentos medicos/hospitalares');
    expect(warning).toContain('ARROZ, FEIJAO');
  });

  it('separa farmacêutico de alimentos', () => {
    expect(checkCnaeMismatch('4644-3/01', null, ['MEDICAMENTO'])).toBeNull();
    expect(checkCnaeMismatch('4644-3/01', null, ['BEBIDA'])).toContain('produtos farmaceuticos');
    expect(checkCnaeMismatch('4637-1/99', null, ['ALIMENTO'])).toBeNull();
    expect(checkCnaeMismatch('4637-1/99', null, ['VALVULA'])).toContain('alimentos/bebidas');
  });

  it('ignora acentos e caixa ao comparar', () => {
    expect(checkCnaeMismatch(null, 'Comércio de produtos médicos', ['válvula'])).toBeNull();
  });

  it('não avisa para CNAE fora das regras conhecidas', () => {
    expect(checkCnaeMismatch('9999-9/99', 'Atividade qualquer', ['ARROZ'])).toBeNull();
  });
});
