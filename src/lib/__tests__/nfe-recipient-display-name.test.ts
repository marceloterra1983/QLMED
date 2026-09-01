import { describe, expect, it } from 'vitest';
import {
  applyRecipientShortNames,
  recipientDisplayName,
} from '@/lib/nfe-emission/recipient-display-name';

describe('recipientDisplayName', () => {
  it('mostra o apelido quando shortName existe', () => {
    expect(recipientDisplayName('Hospital Vida Santa Casa LTDA', 'Vida Saúde')).toBe('Vida Saúde');
  });

  it('mostra a razão social quando shortName é ausente', () => {
    expect(recipientDisplayName('Hospital Vida Santa Casa LTDA')).toBe('Hospital Vida Santa Casa LTDA');
    expect(recipientDisplayName('Hospital Vida Santa Casa LTDA', null)).toBe('Hospital Vida Santa Casa LTDA');
    expect(recipientDisplayName('Hospital Vida Santa Casa LTDA', undefined)).toBe(
      'Hospital Vida Santa Casa LTDA',
    );
  });

  it('não inventa apelido: vazio ou só espaço cai na razão', () => {
    expect(recipientDisplayName('Razao Social LTDA', '')).toBe('Razao Social LTDA');
    expect(recipientDisplayName('Razao Social LTDA', '   ')).toBe('Razao Social LTDA');
    expect(recipientDisplayName('  Razao Social LTDA  ', '\t')).toBe('Razao Social LTDA');
  });

  it('trim no apelido quando ele vence', () => {
    expect(recipientDisplayName('Razao Longa', '  Apelido  ')).toBe('Apelido');
  });
});

describe('applyRecipientShortNames', () => {
  const razao = { cnpj: '12345678000199', name: 'Hospital Vida Santa Casa LTDA' };

  it('anexa shortName sem trocar a razão (name)', () => {
    const out = applyRecipientShortNames([razao], [
      { cnpj: '12345678000199', shortName: 'Vida Saúde' },
    ]);
    expect(out).toEqual([{ ...razao, shortName: 'Vida Saúde' }]);
    expect(out[0].name).toBe('Hospital Vida Santa Casa LTDA');
  });

  it('casa CNPJ mascarado com dígitos e ignora apelido vazio', () => {
    const out = applyRecipientShortNames(
      [razao, { cnpj: '98765432000188', name: 'Sem Apelido SA' }],
      [
        { cnpj: '12.345.678/0001-99', shortName: 'Vida' },
        { cnpj: '98765432000188', shortName: '   ' },
      ],
    );
    expect(out[0].shortName).toBe('Vida');
    expect(out[1]).toEqual({ cnpj: '98765432000188', name: 'Sem Apelido SA' });
    expect(out[1]).not.toHaveProperty('shortName');
  });
});
