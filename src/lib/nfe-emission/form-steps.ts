export const NFE_FORM_STEPS = ['dados', 'itens', 'transporte', 'pagamento', 'complementos'] as const;
export type NfeFormStep = (typeof NFE_FORM_STEPS)[number];

export const NFE_SECTION_ID_PREFIX = 'nfe-secao-';

export const NFE_STEP_LABELS: Record<NfeFormStep, string> = {
  dados: 'Dados',
  itens: 'Itens',
  transporte: 'Transporte',
  pagamento: 'Pagamento',
  complementos: 'Complementos',
};

export function nfeSectionId(step: NfeFormStep): string {
  return `${NFE_SECTION_ID_PREFIX}${step}`;
}

export function nfeStepFromSectionId(id: string): NfeFormStep | null {
  if (!id.startsWith(NFE_SECTION_ID_PREFIX)) return null;
  const step = id.slice(NFE_SECTION_ID_PREFIX.length);
  return (NFE_FORM_STEPS as readonly string[]).includes(step) ? (step as NfeFormStep) : null;
}

export function nextNfeFormStep(step: NfeFormStep): NfeFormStep | null {
  const index = NFE_FORM_STEPS.indexOf(step);
  if (index < 0 || index >= NFE_FORM_STEPS.length - 1) return null;
  return NFE_FORM_STEPS[index + 1];
}

export type NfeStepDraft = {
  destSelected: boolean;
  naturezaSelected: boolean;
  items: Array<{ ncm: string; qCom: string; vUnCom: string }>;
  modFrete: string;
  transpNome: string;
  tPag: string;
  vNf: number;
};

export function nfeStepGaps(step: NfeFormStep, draft: NfeStepDraft): string[] {
  switch (step) {
    case 'dados': {
      const gaps: string[] = [];
      if (!draft.destSelected) gaps.push('Selecione o destinatário PJ');
      if (!draft.naturezaSelected) gaps.push('Selecione a natureza / CFOP');
      return gaps;
    }
    case 'itens': {
      const gaps: string[] = [];
      if (draft.items.length === 0) gaps.push('Inclua ao menos um item');
      if (draft.items.some((item) => item.ncm.length !== 8)) {
        gaps.push('Todo item precisa de NCM com 8 dígitos');
      }
      if (draft.items.some((item) => Number(item.qCom) <= 0 || Number(item.vUnCom) < 0)) {
        gaps.push('Quantidade e valor unitário inválidos');
      }
      return gaps;
    }
    case 'transporte':
      if (draft.modFrete !== '9' && !draft.transpNome.trim()) {
        return ['Informe a transportadora ou use “sem transporte”'];
      }
      return [];
    case 'pagamento':
      if (draft.tPag !== '90' && draft.vNf <= 0) {
        return ['Pagamento informado exige valor da nota maior que zero'];
      }
      return [];
    case 'complementos':
      return [];
  }
}

export type CompleteNfeStepResult =
  | { ok: true; next: NfeFormStep; gaps: [] }
  | { ok: false; next: null; gaps: string[] };

export function completeNfeStep(step: NfeFormStep, draft: NfeStepDraft): CompleteNfeStepResult {
  const next = nextNfeFormStep(step);
  if (!next) {
    return { ok: false, next: null, gaps: [] };
  }
  const gaps = nfeStepGaps(step, draft);
  if (gaps.length > 0) {
    return { ok: false, next: null, gaps };
  }
  return { ok: true, next, gaps: [] };
}

type ScrollTarget = { scrollIntoView: (opts?: ScrollIntoViewOptions) => void };

export function scrollToNfeSection(
  step: NfeFormStep,
  deps: { getElementById: (id: string) => ScrollTarget | null },
): boolean {
  const el = deps.getElementById(nfeSectionId(step));
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

export function findScrollParent(el: Element | null): Element | null {
  let current = el?.parentElement ?? null;
  while (current) {
    const style = getComputedStyle(current);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return current;
    current = current.parentElement;
  }
  return null;
}
