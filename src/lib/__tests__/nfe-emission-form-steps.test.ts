import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NFE_FORM_STEPS,
  completeNfeStep,
  nfeSectionId,
  nfeStepGaps,
  scrollToNfeSection,
  type NfeStepDraft,
} from '@/lib/nfe-emission/form-steps';

const emptyDraft: NfeStepDraft = {
  destSelected: false,
  naturezaSelected: false,
  items: [],
  modFrete: '0',
  transpNome: '',
  tPag: '15',
  vNf: 0,
};

const dadosOk: NfeStepDraft = {
  ...emptyDraft,
  destSelected: true,
  naturezaSelected: true,
};

function pageSrc(): string {
  return readFileSync(
    resolve(__dirname, '../../app/(painel)/fiscal/issued/nova/page-client.tsx'),
    'utf8',
  );
}

describe('Nova NF-e: página única e etapas', () => {
  it('nav rola até a seção clicada', () => {
    let scrolled: string | null = null;
    const ok = scrollToNfeSection('itens', {
      getElementById: (id) => ({
        scrollIntoView: () => {
          scrolled = id;
        },
      }),
    });
    expect(ok).toBe(true);
    expect(scrolled).toBe(nfeSectionId('itens'));
    expect(scrolled).toBe('nfe-secao-itens');
  });

  it('concluir etapa incompleta não avança e lista o que falta', () => {
    const result = completeNfeStep('dados', emptyDraft);
    expect(result.ok).toBe(false);
    expect(result.next).toBeNull();
    expect(result.gaps).toEqual([
      'Selecione o destinatário PJ',
      'Selecione a natureza / CFOP',
    ]);
    expect(nfeStepGaps('dados', { ...emptyDraft, naturezaSelected: true })).toEqual([
      'Selecione o destinatário PJ',
    ]);
  });

  it('concluir Dados vai para Itens', () => {
    const result = completeNfeStep('dados', dadosOk);
    expect(result.ok).toBe(true);
    expect(result.next).toBe('itens');
    expect(result.gaps).toEqual([]);
  });

  it('UI mantém as 5 seções na mesma página e conclui só as 4 primeiras', () => {
    const src = pageSrc();
    expect(src).not.toMatch(/\btab === '/);
    for (const step of NFE_FORM_STEPS) {
      expect(src).toContain(`nfeSectionId('${step}')`);
    }
    expect((src.match(/<StepCompleteFooter/g) || []).length).toBe(4);
    const complementos = src.slice(src.indexOf("nfeSectionId('complementos')"));
    expect(complementos).not.toContain('StepCompleteFooter');
    expect(complementos).not.toContain('Concluir nesta etapa');
    expect(src).toContain('Concluir nesta etapa');
    expect(src).toContain('scrollToNfeSection');
    expect(src).toContain('IntersectionObserver');
  });

  it('botão ativo da etapa usa preenchimento, peso e anel', () => {
    const src = pageSrc();
    const active = src.match(/activeStep === t\.id\s*\n\s*\? '([^']+)'/);
    const idle = src.match(/activeStep === t\.id\s*\n\s*\? '[^']+'\s*\n\s*: '([^']+)'/);
    expect(active?.[1]).toMatch(/bg-primary/);
    expect(active?.[1]).toMatch(/text-white/);
    expect(active?.[1]).toMatch(/font-extrabold/);
    expect(active?.[1]).toMatch(/ring-2/);
    expect(idle?.[1]).toMatch(/font-medium/);
    expect(idle?.[1]).toMatch(/opacity-70/);
    expect(idle?.[1]).not.toMatch(/bg-primary/);
  });
});
