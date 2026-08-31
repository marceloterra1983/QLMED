import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NFE_FORM_STEPS,
  NFE_STEP_TONE,
  completeNfeStep,
  nfeSectionId,
  nfeStepGaps,
  nfeStepHeadingClass,
  nfeStepNavClass,
  nfeStepSectionClass,
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
    const active = nfeStepNavClass('dados', true);
    const idle = nfeStepNavClass('dados', false);
    expect(active).toMatch(/font-extrabold/);
    expect(active).toMatch(/ring-2/);
    expect(active).toMatch(/text-white/);
    expect(idle).toMatch(/font-medium/);
    expect(idle).not.toMatch(/font-extrabold/);
    expect(idle).not.toMatch(/ring-2/);
    const src = pageSrc();
    expect(src).toContain('nfeStepNavClass(t.id, activeStep === t.id)');
    expect(src).not.toMatch(/bg-primary text-white font-extrabold/);
  });

  it('tons por etapa: mapa distinto e UI usa accent de seção', () => {
    const tones = NFE_FORM_STEPS.map((step) => NFE_STEP_TONE[step].tone);
    expect(new Set(tones).size).toBe(5);
    expect(tones).toEqual(['blue', 'emerald', 'amber', 'violet', 'slate']);
    for (const step of NFE_FORM_STEPS) {
      const active = nfeStepNavClass(step, true);
      const idle = nfeStepNavClass(step, false);
      const section = nfeStepSectionClass(step);
      const heading = nfeStepHeadingClass(step);
      expect(active).toMatch(/bg-/);
      expect(active).toMatch(/ring-2/);
      expect(idle).toMatch(/bg-/);
      expect(section).toMatch(/border-t-2/);
      expect(section).toMatch(/\bborder\b/);
      expect(section).toMatch(/bg-/);
      expect(heading).toMatch(/text-/);
    }
    const src = pageSrc();
    expect(src).toContain('NFE_STEP_TONE');
    expect(src).toContain('nfeStepSectionClass');
    expect(src).toContain('nfeStepHeadingClass');
    expect(src).not.toMatch(/bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-5 \$\{nfeStepSectionClass/);
    for (const step of NFE_FORM_STEPS) {
      expect(src).toContain(`nfeStepSectionClass('${step}')`);
    }
  });
});
