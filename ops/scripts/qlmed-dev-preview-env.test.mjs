import { describe, expect, it } from 'vitest';
import {
  assertLoopbackDatabaseUrl,
  pickEnvFile,
  resolvePreviewOrigin,
} from './qlmed-dev-preview-env.mjs';

describe('qlmed-dev-preview-env', () => {
  it('aceita DATABASE_URL em 127.0.0.1', () => {
    const u = assertLoopbackDatabaseUrl(
      'postgresql://qlmed:x@127.0.0.1:5434/postgres',
    );
    expect(u.hostname).toBe('127.0.0.1');
    expect(u.port).toBe('5434');
  });

  it('recusa host remoto (vps2 / produção)', () => {
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
