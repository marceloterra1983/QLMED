#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const gate = require('./verify-production-migration-window.cjs');

assert.equal(gate.TABLES.length, 11);
assert.match(gate.EXPECTED_MIGRATION, /^20260713120500_/);
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
process.stdout.write('Production migration window static contract passed.\n');
