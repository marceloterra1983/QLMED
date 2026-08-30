#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const gate = require('./verify-production-migration-window.cjs');

assert.equal(gate.TABLES.length, 11);
assert.match(gate.EXPECTED_MIGRATION, /^20260830180000_/);
assert.match(gate.EXPECTED_SQL_SHA256, /^[0-9a-f]{64}$/);
assert.deepEqual(
  gate.localMigrations().filter((name) => name === gate.EXPECTED_MIGRATION),
  [gate.EXPECTED_MIGRATION],
);
gate.verifyExpectedSql();
assert.equal(gate.migrationState([]), 'already-applied');
assert.equal(gate.migrationState([gate.EXPECTED_MIGRATION]), 'pending');
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
