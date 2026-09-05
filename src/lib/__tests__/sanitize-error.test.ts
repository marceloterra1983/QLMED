import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBackgroundServiceHealth,
  markBackgroundServiceError,
  markBackgroundServiceStarted,
  sanitizeError,
} from '@/lib/background-service-health';

vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(),
  documentosIngestLockKey: (companyId: string) => `documentos-ingest:${companyId}`,
  documentosAlertLockKey: (companyId: string) => `documentos-alert:${companyId}`,
}));
vi.mock('@/lib/documentos/onedrive-port', () => ({
  createDocumentosFolderPort: vi.fn(),
}));
vi.mock('@/lib/single-company', () => ({ getSingleCompany: vi.fn() }));

describe('sanitizeError — redige o VALOR, não o nome', () => {
  it('é a mesma função exportada por ingest e por background-service-health', async () => {
    const { sanitizeError: sanitizeFromIngest } = await import('@/lib/documentos/ingest');
    expect(sanitizeFromIngest).toBe(sanitizeError);
  });

  it('accessToken=... redige o segredo e mantém o nome', () => {
    const out = sanitizeError('falhou com accessToken=AbC123SegredoQueNaoEJwt fim');
    expect(out).toContain('accessToken=[redacted]');
    expect(out).not.toContain('AbC123SegredoQueNaoEJwt');
    expect(out).not.toMatch(/\[token\]=/);
  });

  it('refreshToken: "..." redige o valor entre aspas', () => {
    const out = sanitizeError('erro refreshToken: "segredoRefreshNaoJwt" x');
    expect(out).toContain('refreshToken=[redacted]');
    expect(out).not.toContain('segredoRefreshNaoJwt');
  });

  it('apikey":"..." (JSON) redige o valor', () => {
    const out = sanitizeError('{"apikey":"jsonSecretValue"}');
    expect(out).toContain('apikey=[redacted]');
    expect(out).not.toContain('jsonSecretValue');
  });

  it('Bearer ... redige o token', () => {
    const out = sanitizeError('Evolution 500 Bearer eyJaaaaaaaaaaa resto');
    expect(out).toMatch(/Bearer \[redacted\]/);
    expect(out).not.toContain('eyJaaaaaaaaaaa');
  });

  it('JWT eyJ... solto é redigido', () => {
    const out = sanitizeError('token eyJbbbbbbbbbb no meio');
    expect(out).toContain('[token]');
    expect(out).not.toContain('eyJbbbbbbbbbb');
  });

  it('e-mail é redigido', () => {
    const out = sanitizeError('falhou para faturamento@qlmed.com.br na pasta');
    expect(out).toContain('[email]');
    expect(out).not.toContain('faturamento@qlmed.com.br');
  });

  it('client_secret, password e Authorization também perdem o valor', () => {
    expect(sanitizeError('client_secret=abcDefGhi')).toBe('client_secret=[redacted]');
    expect(sanitizeError('password: "hunter2"')).toBe('password=[redacted]');
    expect(sanitizeError('Authorization: Bearer abc.def')).toBe('Authorization=[redacted]');
  });

  it('corta em 500 caracteres depois de sanear', () => {
    const out = sanitizeError(`prefixo ${'x'.repeat(600)}`);
    expect(out).toHaveLength(500);
  });
});

describe('markBackgroundServiceError sanea na raiz (B3)', () => {
  beforeEach(() => {
    delete (globalThis as { __qlmedBackgroundServiceHealth?: unknown }).__qlmedBackgroundServiceHealth;
  });

  it('refreshToken=SEGREDO não fica em getBackgroundServiceHealth()', () => {
    markBackgroundServiceStarted('documentos-alert');
    markBackgroundServiceError('documentos-alert', new Error('falhou refreshToken=SEGREDO'));
    const health = getBackgroundServiceHealth()['documentos-alert'];
    expect(health?.lastError).toBeTruthy();
    expect(health?.lastError).not.toContain('SEGREDO');
    expect(health?.lastError).toMatch(/refreshToken=\[redacted\]/);
  });
});
