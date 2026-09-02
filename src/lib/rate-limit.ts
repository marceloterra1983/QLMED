/**
 * AUTH-008 — TETO CONHECIDO: este contador vive num `Map` do PROCESSO.
 *
 * Consequências, explícitas de propósito:
 *  - com N instâncias da app, o limite efectivo é N x `maxRequests`, porque cada
 *    processo conta o seu próprio balde;
 *  - todo contador zera num restart/deploy;
 *  - o limite de login é por IP (`getClientIp`) e global, nunca por identidade:
 *    a ADR-0012 proíbe travar uma conta a partir de tentativas falhadas, para
 *    que ninguém consiga trancar o operador de fora.
 *
 * O QLMED corre HOJE numa instância só, e é essa a suposição que sustenta o
 * controlo. A aceitação está registada em `SECURITY.md`
 * (QLMED-RISK-2026-09-RATELIMIT-INPROC) com o gatilho de remediação: no dia em
 * que a app escalar para mais de um processo, este store tem de passar a ser
 * partilhado (tabela em Postgres com `key`/`resetAt`), o que exige migração de
 * schema.
 */
export interface RateLimitConfig {
  interval: number;   // Time window in milliseconds (e.g., 60000 for 1 min)
  maxRequests: number; // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
let callCount = 0;

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of Array.from(store.entries())) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  callCount++;
  if (callCount % 100 === 0) {
    cleanup();
  }

  const now = Date.now();
  const entry = store.get(key);

  // No entry or expired window — start fresh
  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.interval;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  // Within window and under limit
  if (entry.count < config.maxRequests) {
    entry.count++;
    return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
  }

  // Over limit
  return { allowed: false, remaining: 0, resetAt: entry.resetAt };
}

export function getRateLimitHeaders(remaining: number, resetAt: number): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };
}

export const RATE_LIMITS = {
  login: { interval: 60_000, maxRequests: 5 },
  // REAUD-B-16: a senha é a identidade (ADR-0012), então cada tentativa faz
  // `bcrypt.compare` contra TODOS os utilizadores antes de qualquer bloqueio.
  // Medido: 185 ms por compare a custo 12 (bcryptjs, JS puro, na thread
  // principal). Teto de CPU por minuto = N × maxRequests × 0,185 s. Com 120
  // e 10 utilizadores eram 222 s de CPU por minuto — 3,7 threads que o Node
  // não tem. Com 20, 10 utilizadores custam 37 s (62% da thread) e a app só
  // satura a partir de ~16 utilizadores. O middleware devolve 429 antes de o
  // `authorize` correr, então o laço de bcrypt nunca arranca acima do teto.
  loginGlobal: { interval: 60_000, maxRequests: 20 },
  loginAccount: { interval: 15 * 60_000, maxRequests: 10 },
  upload: { interval: 60_000, maxRequests: 10 },
  webhook: { interval: 60_000, maxRequests: 60 },
  // REAUD-B-15: link público de notificação, fora do matcher do middleware.
  notificationClick: { interval: 60_000, maxRequests: 30 },
} as const satisfies Record<string, RateLimitConfig>;
