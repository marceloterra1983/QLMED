import { describe, expect, it, vi } from 'vitest';
import {
  adviseSefazFollowup,
  routeSefazFollowup,
  sefazFollowupQuestions,
  type SefazFollowupDecision,
} from '@/lib/nfe-emission/jev-sefaz-followup';

describe('routeSefazFollowup', () => {
  it('AC-001 lote em processamento não alerta humano', () => {
    const answers = {
      needs_human: { noul: 0.04 },
      action: { choice: 'retry' as const, confidence: 0.3 },
    };
    expect(routeSefazFollowup(answers)).toBe('retry');
  });

  it('AC-005 certificado recomenda alerta', () => {
    const answers = {
      needs_human: { noul: 0.91 },
      action: { choice: 'alert' as const, confidence: 0.8 },
    };
    expect(routeSefazFollowup(answers)).toBe('alert');
  });
});

describe('adviseSefazFollowup', () => {
  it('AC-003 sem chave não chama rede', async () => {
    const decide = vi.fn();
    const result = await adviseSefazFollowup(
      { outcome: 'pending', cStat: '323', xMotivo: 'Lote em processamento' },
      { apiKey: '', decide },
    );
    expect(result.route).toBe('skipped');
    expect(decide).not.toHaveBeenCalled();
  });

  it('AC-002 não altera o desfecho fiscal recebido', async () => {
    const decide = vi.fn(async () => ({
      answers: {
        needs_human: { noul: 0.04 },
        action: { choice: 'retry' as const, confidence: 0.3 },
      },
    }));
    const input = {
      outcome: 'rejected' as const,
      cStat: '323',
      xMotivo: 'Rejeicao: Lote em processamento',
    };
    const result = await adviseSefazFollowup(input, { apiKey: 'sk-or-test', decide });
    expect(result.fiscal).toEqual(input);
    expect(result.route).toBe('retry');
    expect(decide).toHaveBeenCalledWith({
      state: {
        surface: 'nfe_autorizacao',
        outcome: 'rejected',
        cStat: '323',
        xMotivo: 'Rejeicao: Lote em processamento',
        environment: 'unspecified',
      },
      questions: sefazFollowupQuestions(),
    });
  });

  it('AC-004 decide lançando vira skipped', async () => {
    const decide = vi.fn(async () => {
      throw new Error('timeout');
    });
    const result = await adviseSefazFollowup(
      { outcome: 'rejected', cStat: '280', xMotivo: 'Certificado vencido' },
      { apiKey: 'sk-or-test', decide },
    );
    expect(result.route).toBe('skipped');
  });
});

describe('SefazFollowupDecision typing', () => {
  it('aceita o formato de resposta do serviço', () => {
    const decision: SefazFollowupDecision = {
      answers: {
        needs_human: { noul: 0.5 },
        action: { choice: 'ignore', confidence: 0.1 },
      },
    };
    expect(routeSefazFollowup(decision.answers)).toBe('log_only');
  });
});
