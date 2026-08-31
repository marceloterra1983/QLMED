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

/** Tom visual por etapa (nav + card da seção). Ativo = preenchido/anel; inativo = muted da mesma família. */
export type NfeStepToneClasses = {
  tone: 'blue' | 'emerald' | 'amber' | 'violet' | 'slate';
  navActive: string;
  navIdle: string;
  /** Card da seção: borda + fundo sutil + accent superior (mesmo tom da nav). */
  section: string;
  heading: string;
};

export const NFE_STEP_TONE: Record<NfeFormStep, NfeStepToneClasses> = {
  dados: {
    tone: 'blue',
    navActive:
      'bg-blue-600 text-white font-extrabold shadow-md ring-2 ring-blue-800 ring-offset-2 ring-offset-slate-100 dark:bg-blue-500 dark:ring-blue-200 dark:ring-offset-slate-800',
    navIdle:
      'bg-blue-50 text-blue-800 font-medium border border-blue-100/80 hover:bg-blue-100/80 dark:bg-blue-950/35 dark:text-blue-200 dark:border-blue-900/50 dark:hover:bg-blue-950/55',
    section: 'border border-blue-200/90 bg-blue-50/45 border-t-2 border-t-blue-500 dark:border-blue-800/55 dark:bg-blue-950/30 dark:border-t-blue-400',
    heading: 'text-blue-900 dark:text-blue-100',
  },
  itens: {
    tone: 'emerald',
    navActive:
      'bg-emerald-600 text-white font-extrabold shadow-md ring-2 ring-emerald-800 ring-offset-2 ring-offset-slate-100 dark:bg-emerald-500 dark:ring-emerald-200 dark:ring-offset-slate-800',
    navIdle:
      'bg-emerald-50 text-emerald-900 font-medium border border-emerald-100/80 hover:bg-emerald-100/80 dark:bg-emerald-950/35 dark:text-emerald-200 dark:border-emerald-900/50 dark:hover:bg-emerald-950/55',
    section: 'border border-emerald-200/90 bg-emerald-50/45 border-t-2 border-t-emerald-500 dark:border-emerald-800/55 dark:bg-emerald-950/30 dark:border-t-emerald-400',
    heading: 'text-emerald-900 dark:text-emerald-100',
  },
  transporte: {
    tone: 'amber',
    navActive:
      'bg-amber-600 text-white font-extrabold shadow-md ring-2 ring-amber-800 ring-offset-2 ring-offset-slate-100 dark:bg-amber-500 dark:text-white dark:ring-amber-200 dark:ring-offset-slate-800',
    navIdle:
      'bg-amber-50 text-amber-950 font-medium border border-amber-100/80 hover:bg-amber-100/80 dark:bg-amber-950/35 dark:text-amber-100 dark:border-amber-900/50 dark:hover:bg-amber-950/55',
    section: 'border border-amber-200/90 bg-amber-50/45 border-t-2 border-t-amber-500 dark:border-amber-800/55 dark:bg-amber-950/30 dark:border-t-amber-400',
    heading: 'text-amber-950 dark:text-amber-100',
  },
  pagamento: {
    tone: 'violet',
    navActive:
      'bg-violet-600 text-white font-extrabold shadow-md ring-2 ring-violet-800 ring-offset-2 ring-offset-slate-100 dark:bg-violet-500 dark:ring-violet-200 dark:ring-offset-slate-800',
    navIdle:
      'bg-violet-50 text-violet-900 font-medium border border-violet-100/80 hover:bg-violet-100/80 dark:bg-violet-950/35 dark:text-violet-200 dark:border-violet-900/50 dark:hover:bg-violet-950/55',
    section: 'border border-violet-200/90 bg-violet-50/45 border-t-2 border-t-violet-500 dark:border-violet-800/55 dark:bg-violet-950/30 dark:border-t-violet-400',
    heading: 'text-violet-900 dark:text-violet-100',
  },
  complementos: {
    tone: 'slate',
    navActive:
      'bg-slate-700 text-white font-extrabold shadow-md ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-100 dark:bg-slate-500 dark:ring-slate-200 dark:ring-offset-slate-800',
    navIdle:
      'bg-slate-100 text-slate-700 font-medium border border-slate-200/80 hover:bg-slate-200/70 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800',
    section: 'border border-slate-300/90 bg-slate-50/70 border-t-2 border-t-slate-500 dark:border-slate-600/70 dark:bg-slate-900/40 dark:border-t-slate-400',
    heading: 'text-slate-900 dark:text-slate-100',
  },
};

export function nfeStepNavClass(step: NfeFormStep, active: boolean): string {
  const tone = NFE_STEP_TONE[step];
  return active ? tone.navActive : tone.navIdle;
}

export function nfeStepSectionClass(step: NfeFormStep): string {
  return NFE_STEP_TONE[step].section;
}

export function nfeStepHeadingClass(step: NfeFormStep): string {
  return NFE_STEP_TONE[step].heading;
}

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
