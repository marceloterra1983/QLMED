import { describe, expect, it } from 'vitest';
import {
  assertLoopbackDatabaseUrl,
  assertPreviewDatabaseUrl,
  pickEnvFile,
  resolvePreviewOrigin,
} from './qlmed-dev-preview-env.mjs';

describe('qlmed-dev-preview-env', () => {
  it('aceita DATABASE_URL do túnel canônico :5435', () => {
    const u = assertPreviewDatabaseUrl(
      'postgresql://qlmed:x@127.0.0.1:5435/postgres',
    );
    expect(u.hostname).toBe('127.0.0.1');
    expect(u.port).toBe('5435');
  });

  it('recusa dump isolado :5434', () => {
    expect(() =>
      assertPreviewDatabaseUrl(
        'postgresql://qlmed:x@127.0.0.1:5434/postgres',
      ),
    ).toThrow(/dump isolado/);
  });

  it('recusa host remoto (vps2 / produção direto)', () => {
    expect(() =>
      assertLoopbackDatabaseUrl(
        'postgresql://qlmed:x@100.92.240.120:5432/postgres',
      ),
    ).toThrow(/recusa DATABASE_URL/);
  });

  it('origem Tailscale ganha de 127.0.0.1', () => {
    expect(resolvePreviewOrigin({ tailscaleIp: '100.68.84.119' })).toBe(
      'http://100.68.84.119:3002',
    );
  });

  it('override explícito ganha do Tailscale', () => {
    expect(
      resolvePreviewOrigin({
        override: 'http://example.local:3002/',
        tailscaleIp: '100.68.84.119',
      }),
    ).toBe('http://example.local:3002');
  });

  it('pickEnvFile ignora caminhos inexistentes', () => {
    expect(() =>
      pickEnvFile(['/no/such/qlmed.env', '/srv/qlmed/env/app.env']),
    ).toThrow(/nenhum env encontrado/);
  });
});
