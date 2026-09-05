#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const gate = require('./verify-production-migration-window.cjs');

assert.equal(gate.TABLES.length, 11);
assert.ok(gate.EXPECTED_MIGRATIONS.length >= 8, 'o conjunto pinado tem a âncora + as 7 da remediação');
assert.ok(
  gate.EXPECTED_MIGRATIONS.some((m) => m.name === '20260905210000_unimed_cg_autorizacoes'),
  'SPEC-045 unimed_cg_autorizacoes deve estar pinada',
);
for (const { name, sha256 } of gate.EXPECTED_MIGRATIONS) {
  assert.match(name, /^2026\d{10}_/);
  assert.match(sha256, /^[0-9a-f]{64}$/);
  assert.ok(gate.localMigrations().includes(name), `pinada mas ausente localmente: ${name}`);
}
assert.match(gate.EXPECTED_SET_DIGEST, /^[0-9a-f]{64}$/);
gate.verifyExpectedSql();
assert.equal(gate.migrationState([]), 'already-applied');
assert.equal(gate.migrationState([gate.EXPECTED_MIGRATION]), 'pending');
// Os 7 pendentes de uma vez — o caso que o pin único recusava. Nomeados em vez
// de contados por prefixo: o filtro `startsWith('202609')` era um atalho que
// quebrava a cada migração nova de setembro, e um teste que quebra por uma
// migração legítima ensina a afrouxá-lo. Nomear prova a mesma propriedade sem
// esse falso positivo.
const seteDaRemediacao = [
  '20260901180000_nfe_emission_atomic',
  '20260902100000_satellite_foreign_keys',
  '20260902110000_company_user_restrict',
  '20260902120000_invoice_tax_totals_item_count',
  '20260902130000_n8n_webhook_nonce',
  '20260903140000_issued_nfe_series_coalesce',
  '20260903140100_sync_skipped_document',
];
assert.equal(seteDaRemediacao.length, 7);
const pinadas = new Set(gate.EXPECTED_MIGRATIONS.map((m) => m.name));
for (const nome of seteDaRemediacao) {
  assert.ok(pinadas.has(nome), `a remediação b177b07 saiu do conjunto pinado: ${nome}`);
}
assert.equal(gate.migrationState(seteDaRemediacao), 'pending');
// E o conjunto pinado INTEIRO tem de ser aceite de uma vez: é exatamente o que
// o deploy encontra quando a produção está atrás de várias migrações.
assert.equal(gate.migrationState([...pinadas]), 'pending');
// Controlo positivo: um nome fora da lista continua a reprovar (exit 78).
{
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(process.execPath, ['-e', `
    const g = require('./scripts/verify-production-migration-window.cjs');
    g.migrationState(['20991231000000_intrusa']);
  `]);
  assert.equal(r.status, 78, 'pendente desconhecida tem de reprovar com 78');
  assert.match(r.stderr.toString(), /unexpected pending migrations: 20991231000000_intrusa/);
}
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
assert.match(
  dockerfile,
  /COPY --from=builder .*\/app\/scripts\/verify-production-migration-window\.cjs \.\/scripts\/verify-production-migration-window\.cjs/,
  'production runner image must contain the migration-window verifier invoked by deploy-production.yml',
);
assert.match(
  dockerfile,
  /COPY --from=builder .*\/app\/scripts\/validate-database-config\.mjs \.\/scripts\/validate-database-config\.mjs/,
  'production runner image must contain the canonical DATABASE_URL validator',
);

const startSh = fs.readFileSync('start.sh', 'utf8');
const startShCommands = startSh
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');
assert.match(startShCommands, /migrate deploy/, 'start.sh must still apply pending migrations on boot');
assert.doesNotMatch(
  startShCommands,
  /migrate diff[\s\S]*--exit-code/,
  'start.sh must not fail-closed on expand drift: image rollback does not undo migrations',
);

const deployYml = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
assert.match(
  deployYml,
  /id:\s*app_verified/,
  'public endpoint verification must be id=app_verified so a worker-hook failure does not roll back a healthy app',
);
assert.match(
  deployYml,
  /steps\.app_verified\.outcome\s*!=\s*'success'/,
  'automatic rollback must run only when app verification did not succeed',
);
assert.match(
  deployYml,
  /Worker install attempt/,
  'worker install must retry transient smoke 401s before failing the job',
);

const installer = fs.readFileSync('scripts/install-notification-outbox-cron.sh', 'utf8');
assert.match(
  installer,
  /retrying in 5s/,
  'notification worker installer must retry smoke against a freshly started app',
);

process.stdout.write('Production migration window static contract passed.\n');
