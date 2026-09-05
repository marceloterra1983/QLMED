#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

// Conjunto PINADO de migrações que este deploy pode aplicar. Cada entrada leva
// o SHA-256 do seu SQL: mudar o ficheiro depois de pinado reprova. A versão
// anterior pinava UMA migração — e a remediação da auditoria b177b07 traz sete
// de uma vez; o portão recusava-as todas como "unexpected pending" antes de
// sequer chegar ao `migrate deploy`. O modelo continua fail-closed: pendente
// fora desta lista reprova; lista vazia de pendentes é "já aplicado".
const EXPECTED_MIGRATIONS = [
  { name: '20260831230000_add_cassems_whatsapp_notify', sha256: 'b5afb51980bae0f626e4d638cb493ec9a1b583011fcb03995c2b7c0eef20bc56' },
  { name: '20260901180000_nfe_emission_atomic', sha256: 'ba10a69269e4b4437934487c86b8a462afec67045a5f2155f538514bb870a2b9' },
  { name: '20260902100000_satellite_foreign_keys', sha256: 'a2ebb5f02222db6c63b98c19012ea25588e74a4645b4293fb1abc9b382a98acc' },
  { name: '20260902110000_company_user_restrict', sha256: 'd598b629a5e5c7e128de4468e5776b0e0346181ac79d354551d621849d89cb6f' },
  { name: '20260902120000_invoice_tax_totals_item_count', sha256: 'c3447fa4ad73b0acd8c17a4f83f424e920aded1c26a86e60b4a61fdb963bf76b' },
  { name: '20260902130000_n8n_webhook_nonce', sha256: '9caf878f6c97f6fec190c279b70cb37446e5e656e38a71cf9fb37db4e74d4632' },
  { name: '20260903140000_issued_nfe_series_coalesce', sha256: 'b645400645b306944dc0f910233a97956d410966330174c2888f6a7c3b6028f7' },
  { name: '20260903140100_sync_skipped_document', sha256: '12fb3012e5e01dfef07ec694a38b8b3f07a72cc823467ccd9d3783f98edf1751' },
  { name: '20260904204949_company_document', sha256: 'b9ec57e96ce10fd107f710e36bb53d5aa18a46989d513061075831a20dd07abb' },
  { name: '20260904221500_company_document_kind_mt', sha256: '924d976b7b03d10a7886d36fa08c6e80f42239c7d702c094eaf69fb50e666f76' },
  { name: '20260905000000_company_document_families', sha256: 'b56700a71067540b6aab0ebe6f6371a93bb4ba234bbe3b921da8de0978c234d9' },
  { name: '20260905120000_company_document_l11_familias', sha256: '85744d6497b65920ace10c96a16f79534e80c3322324604b120ed78526e1c8eb' },
  { name: '20260905180000_company_document_emitido_em', sha256: '49acc6d75a6edf5871c6acd82beca81358b01d93dc78acbd82df7f7c053ffb36' },
  { name: '20260905210000_unimed_cg_autorizacoes', sha256: '9b5af9a1d7ecb33c43b83f95cdfe0151da74ce8ef15cb67bacbb2b2ffa51b83b' },
];
// Compatibilidade com quem ainda lê um nome só: a última da lista.
const EXPECTED_MIGRATION = EXPECTED_MIGRATIONS[EXPECTED_MIGRATIONS.length - 1].name;
const EXPECTED_SQL_SHA256 = EXPECTED_MIGRATIONS[EXPECTED_MIGRATIONS.length - 1].sha256;
// Identidade do conjunto, gravada no estado `before` e conferida no `after`.
const EXPECTED_SET_DIGEST = crypto.createHash('sha256')
  .update(EXPECTED_MIGRATIONS.map((m) => `${m.name}:${m.sha256}`).join('\n'))
  .digest('hex');
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
  for (const { name, sha256 } of EXPECTED_MIGRATIONS) {
    const sqlPath = path.join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql');
    const sql = fs.readFileSync(sqlPath);
    const digest = crypto.createHash('sha256').update(sql).digest('hex');
    if (digest !== sha256) fail(`expected migration SQL hash drift: ${name}`);
  }
}

function migrationState(pending) {
  if (pending.length === 0) return 'already-applied';
  const expected = new Set(EXPECTED_MIGRATIONS.map((m) => m.name));
  const unexpected = pending.filter((name) => !expected.has(name));
  if (unexpected.length === 0) return 'pending';
  fail(`unexpected pending migrations: ${unexpected.join(',')}`);
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
        schemaVersion: 3,
        migration: EXPECTED_SET_DIGEST,
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
      before.schemaVersion !== 3
      || before.migration !== EXPECTED_SET_DIGEST
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
  EXPECTED_MIGRATIONS,
  EXPECTED_SET_DIGEST,
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
