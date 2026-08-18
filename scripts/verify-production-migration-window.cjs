#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

const EXPECTED_MIGRATION = '20260814180000_expand_invoice_duplicata_decimal';
const EXPECTED_SQL_SHA256 = '3093162660213696af51555c76837f541fde2905526f4c11db3952c1384abed1';
const TABLES = [
  'invoice_tax_totals', 'invoice_item_tax', 'contact_fiscal',
  'invoice_duplicata', 'ncm_cache', 'product_registry', 'stock_entry',
  'nfe_entry_item', 'product_settings_catalog', 'cnpj_cache',
  'cnpj_monitoring',
];

function fail(message) {
  process.stderr.write(`Production migration window refused: ${message}\n`);
  process.exit(78);
}

function verifyCanonicalDatabaseConfig() {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'validate-database-config.mjs')],
    { stdio: 'inherit' },
  );

  if (result.error || result.status !== 0) {
    fail('canonical DATABASE_URL validation failed');
  }
}

function localMigrations() {
  return fs.readdirSync(path.join(process.cwd(), 'prisma', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function verifyExpectedSql() {
  const sqlPath = path.join(process.cwd(), 'prisma', 'migrations', EXPECTED_MIGRATION, 'migration.sql');
  const sql = fs.readFileSync(sqlPath);
  const digest = crypto.createHash('sha256').update(sql).digest('hex');
  if (digest !== EXPECTED_SQL_SHA256) fail('expected migration SQL hash drift');
}

function migrationState(pending) {
  if (pending.length === 0) return 'already-applied';
  if (pending.length === 1 && pending[0] === EXPECTED_MIGRATION) return 'pending';
  fail(`unexpected pending migrations: ${pending.join(',')}`);
}

async function snapshot(client) {
  const counts = {};
  for (const table of TABLES) {
    const result = await client.query(`SELECT count(*)::text AS count FROM "${table}"`);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

async function main() {
  const [mode, statePath] = process.argv.slice(2);
  if (!['before', 'after'].includes(mode) || !statePath) fail('usage: before|after STATE_PATH');
  verifyCanonicalDatabaseConfig();
  verifyExpectedSql();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const rows = await client.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const applied = new Set(rows.rows.map((row) => row.migration_name));
    const pending = localMigrations().filter((name) => !applied.has(name));
    const counts = await snapshot(client);
    if (mode === 'before') {
      const migrationStatus = migrationState(pending);
      fs.writeFileSync(statePath, JSON.stringify({
        schemaVersion: 2,
        migration: EXPECTED_MIGRATION,
        migrationStatus,
        counts,
      }));
      fs.chmodSync(statePath, 0o600);
      process.stdout.write(JSON.stringify({
        status: 'PASSED', stage: mode, pending: pending.length, migrationStatus, tables: TABLES.length,
      }) + '\n');
      return;
    }
    if (pending.length !== 0) fail(`migrations remain pending: ${pending.join(',')}`);
    const before = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (
      before.schemaVersion !== 2
      || before.migration !== EXPECTED_MIGRATION
      || !['pending', 'already-applied'].includes(before.migrationStatus)
    ) fail('pre-migration state binding invalid');
    // The approved expand adds sidecars and backfills them. Stable row counts
    // prove that the migration path did not create or delete business rows;
    // normal traffic must be quiesced by the environment approval window.
    if (JSON.stringify(before.counts) !== JSON.stringify(counts)) fail('satellite table counts changed in migration window');
    process.stdout.write(JSON.stringify({ status: 'PASSED', stage: mode, pending: 0, countsEqual: true, tables: TABLES.length }) + '\n');
  } finally {
    await client.end();
  }
}

module.exports = {
  EXPECTED_MIGRATION,
  EXPECTED_SQL_SHA256,
  TABLES,
  localMigrations,
  migrationState,
  verifyExpectedSql,
};

if (require.main === module) {
  main().catch((error) => fail(error instanceof Error ? error.message : 'unknown error'));
}
