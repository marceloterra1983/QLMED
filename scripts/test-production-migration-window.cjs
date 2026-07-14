#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const gate = require('./verify-production-migration-window.cjs');

assert.equal(gate.TABLES.length, 11);
assert.match(gate.EXPECTED_MIGRATION, /^20260713120500_/);
assert.match(gate.EXPECTED_SQL_SHA256, /^[0-9a-f]{64}$/);
assert.deepEqual(
  gate.localMigrations().filter((name) => name === gate.EXPECTED_MIGRATION),
  [gate.EXPECTED_MIGRATION],
);
gate.verifyExpectedSql();
process.stdout.write('Production migration window static contract passed.\n');
