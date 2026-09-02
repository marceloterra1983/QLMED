import { describe, it, expect } from 'vitest';
import { getValorColor, statusConfig } from '@/app/(painel)/financeiro/components/financeiro-utils';

describe('getValorColor', () => {
  it('pinta o valor a pagar de vermelho (dinheiro saindo)', () => {
    expect(getValorColor('pagar')).toContain('text-red-600');
  });

  it('pinta o valor a receber de verde (dinheiro entrando)', () => {
    expect(getValorColor('receber')).toContain('text-emerald-600');
  });

  it('distingue os dois sentidos — reprova se a cor voltar a ser fixa', () => {
    expect(getValorColor('pagar')).not.toBe(getValorColor('receber'));
  });

  it('define dark mode nos dois sentidos', () => {
    expect(getValorColor('pagar')).toMatch(/dark:/);
    expect(getValorColor('receber')).toMatch(/dark:/);
  });

  it('não usa vermelho para receber — a confusão que motivou a correção', () => {
    expect(getValorColor('receber')).not.toMatch(/text-red-/);
  });

  it('mantém a cor de STATUS independente da cor de valor', () => {
    // Vencida é vermelha nos dois sentidos: o prazo não depende do fluxo.
    // O tom é o que o <Badge> pinta; as classes já não vivem aqui.
    expect(statusConfig.overdue.tone).toBe('danger');
    expect(statusConfig.upcoming.tone).toBe('success');
  });
});
