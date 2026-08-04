#!/usr/bin/env node

const legacyDatabaseVariables = [
  'QLMED_DATABASE_URL',
  'QLMED_DEV_DATABASE_URL',
  'QLMED_PROD_DATABASE_URL',
  'DATABASE_URL_DEV',
  'DATABASE_URL_PROD',
];
const canonicalDatabaseNames = new Set(['postgres', 'qlmed_ci']);

function isLegacyDatabaseVariable(name) {
  return (
    name !== 'DATABASE_URL'
    && (legacyDatabaseVariables.includes(name)
      || name.startsWith('DATABASE_URL_')
      || /^QLMED_.*DATABASE_URL$/.test(name))
  );
}

function fail(message) {
  console.error(`[QLMED] Database configuration invalid: ${message}`);
  process.exit(1);
}

const configuredLegacyVariables = Object.keys(process.env).filter(
  (name) => isLegacyDatabaseVariable(name) && process.env[name]?.trim(),
);
if (configuredLegacyVariables.length > 0) {
  fail(`only DATABASE_URL is supported (remove ${configuredLegacyVariables.join(', ')})`);
}

const rawUrl = process.env.DATABASE_URL?.trim();
if (!rawUrl) fail('DATABASE_URL is required');

let parsed;
try {
  parsed = new URL(rawUrl);
} catch {
  fail('DATABASE_URL is not a valid URL');
}

if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
  fail('DATABASE_URL must use the postgres or postgresql scheme');
}

let databaseName;
try {
  databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim();
} catch {
  fail('DATABASE_URL contains an invalid database name');
}
if (!databaseName) fail('DATABASE_URL must include a database name');
if (!canonicalDatabaseNames.has(databaseName.toLowerCase())) {
  fail('DATABASE_URL must target the canonical postgres database or disposable qlmed_ci');
}

console.log('QLMED database configuration is canonical (DATABASE_URL only).');
