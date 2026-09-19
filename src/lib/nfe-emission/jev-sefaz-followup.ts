import { createLogger } from '@/lib/logger';

const log = createLogger('jev-sefaz-followup');

const OPENROUTER_URL = 'https://openrouter.ai/api/alpha/decisions';
const OPENROUTER_MODEL = 'typesafe/jev-1.13';
const DEFAULT_TIMEOUT_MS = 2_500;
const HUMAN_THRESHOLD = 0.7;

export type SefazFollowupOutcome = 'pending' | 'rejected';
export type SefazFollowupRoute = 'retry' | 'alert' | 'log_only' | 'skipped';

export type SefazFollowupInput = {
  outcome: SefazFollowupOutcome;
  cStat: string;
  xMotivo: string;
  environment?: string;
  emissionId?: string;
};

export type SefazFollowupAnswers = {
  needs_human?: { noul?: number };
  action?: { choice?: 'retry' | 'alert' | 'ignore'; confidence?: number };
};

export type SefazFollowupDecision = { answers: SefazFollowupAnswers };

export type JevDecide = (input: {
  state: unknown;
  questions: unknown;
}) => Promise<SefazFollowupDecision>;

export function sefazFollowupQuestions() {
  return {
    needs_human: {
      type: 'noul',
      instructions:
        'Should an operator be paged now, instead of only logging and retrying later?',
      criteria: {
        true: 'Human action is needed (certificate, schema, duplicate key, business rejection)',
        false: 'Safe to retry or wait (lote em processamento, timeout, 103/105)',
      },
    },
    action: {
      type: 'choice',
      instructions: 'What should the operations code do next?',
      criteria: {
        retry: 'Automatic retry / wait for async batch',
        alert: 'Alert a human',
        ignore: 'No follow-up',
      },
    },
  };
}

export function routeSefazFollowup(
  answers: SefazFollowupAnswers,
  { humanThreshold = HUMAN_THRESHOLD } = {},
): Exclude<SefazFollowupRoute, 'skipped'> {
  const human = Number(answers.needs_human?.noul ?? 0);
  const action = answers.action?.choice ?? 'ignore';
  if (action === 'alert' || human >= humanThreshold) return 'alert';
  if (action === 'retry') return 'retry';
  return 'log_only';
}

export async function decideOpenRouter(
  input: { state: unknown; questions: unknown },
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SefazFollowupDecision> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'qlmed-sefaz-followup',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        state: input.state,
        questions: input.questions,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenRouter HTTP ${response.status}`);
    }
    return JSON.parse(text) as SefazFollowupDecision;
  } finally {
    clearTimeout(timer);
  }
}

export async function adviseSefazFollowup(
  fiscal: SefazFollowupInput,
  deps: { apiKey?: string; decide?: JevDecide } = {},
): Promise<{ route: SefazFollowupRoute; fiscal: SefazFollowupInput }> {
  const apiKey = (deps.apiKey ?? process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) {
    return { route: 'skipped', fiscal };
  }

  const decide =
    deps.decide ??
    ((payload) => decideOpenRouter(payload, apiKey));

  try {
    const decision = await decide({
      state: {
        surface: 'nfe_autorizacao',
        outcome: fiscal.outcome,
        cStat: fiscal.cStat,
        xMotivo: fiscal.xMotivo,
        environment: fiscal.environment ?? 'unspecified',
      },
      questions: sefazFollowupQuestions(),
    });
    const route = routeSefazFollowup(decision.answers);
    log.info(
      {
        emissionId: fiscal.emissionId,
        outcome: fiscal.outcome,
        cStat: fiscal.cStat,
        route,
        needsHuman: decision.answers.needs_human?.noul,
        action: decision.answers.action?.choice,
      },
      'Jev SEFAZ follow-up',
    );
    return { route, fiscal };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'follow-up failed';
    log.warn({ emissionId: fiscal.emissionId, err: message }, 'Jev SEFAZ follow-up skipped');
    return { route: 'skipped', fiscal };
  }
}
