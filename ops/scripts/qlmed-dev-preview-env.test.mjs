import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLoopbackDatabaseUrl,
  pickEnvFile,
  resolvePreviewOrigin,
} from './qlmed-dev-preview-env.mjs';

test('aceita DATABASE_URL em 127.0.0.1', () => {
  const u = assertLoopbackDatabaseUrl(
    'postgresql://qlmed:x@127.0.0.1:5434/postgres',
  );
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.port, '5434');
});

test('recusa host remoto (vps2 / produção)', () => {
  assert.throws(
    () =>
      assertLoopbackDatabaseUrl(
        'postgresql://qlmed:x@100.92.240.120:5432/postgres',
      ),
    /recusa DATABASE_URL/,
  );
});

test('origem Tailscale ganha de 127.0.0.1', () => {
  assert.equal(
    resolvePreviewOrigin({ tailscaleIp: '100.68.84.119' }),
    'http://100.68.84.119:3002',
  );
});

test('override explícito ganha do Tailscale', () => {
  assert.equal(
    resolvePreviewOrigin({
      override: 'http://example.local:3002/',
      tailscaleIp: '100.68.84.119',
    }),
    'http://example.local:3002',
  );
});

test('pickEnvFile ignora caminhos inexistentes', () => {
  assert.throws(
    () => pickEnvFile(['/no/such/qlmed.env', '/srv/qlmed/env/app.env']),
    /nenhum env encontrado/,
  );
});
