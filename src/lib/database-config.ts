/**
 * Canonical QLMED persistence configuration.
 *
 * QLMED has one persistent database.  The application intentionally accepts
 * one connection variable (`DATABASE_URL`) instead of maintaining parallel
 * production/development URLs that can drift.  CI may still provide its own
 * disposable PostgreSQL service; that service is not a persistent QLMED
 * environment.
 */

const legacyDatabaseVariables = [
  'QLMED_DATABASE_URL',
  'QLMED_DEV_DATABASE_URL',
  'QLMED_PROD_DATABASE_URL',
  'DATABASE_URL_DEV',
  'DATABASE_URL_PROD',
] as const;

const canonicalDatabaseNames = new Set(['postgres', 'qlmed_ci']);

function isLegacyDatabaseVariable(name: string): boolean {
  return (
    name !== 'DATABASE_URL' &&
    (legacyDatabaseVariables.includes(name as (typeof legacyDatabaseVariables)[number]) ||
      name.startsWith('DATABASE_URL_') ||
      /^QLMED_.*DATABASE_URL$/.test(name))
  );
}

export type CanonicalDatabaseTarget = {
  databaseName: string;
  host: string;
  port: string;
  protocol: 'postgres' | 'postgresql';
};

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigurationError';
  }
}

function databaseNameFromUrl(parsed: URL): string {
  let databaseName: string;

  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim();
  } catch {
    throw new DatabaseConfigurationError('DATABASE_URL contains an invalid database name');
  }

  if (!databaseName) {
    throw new DatabaseConfigurationError(
      'DATABASE_URL must include a database name',
    );
  }

  return databaseName;
}

export function parseCanonicalDatabaseUrl(
  rawUrl: string,
): CanonicalDatabaseTarget {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DatabaseConfigurationError('DATABASE_URL is not a valid URL');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new DatabaseConfigurationError(
      'DATABASE_URL must use the postgres or postgresql scheme',
    );
  }

  const databaseName = databaseNameFromUrl(parsed);
  const normalizedDatabaseName = databaseName.toLowerCase();
  if (!canonicalDatabaseNames.has(normalizedDatabaseName)) {
    throw new DatabaseConfigurationError(
      'DATABASE_URL must target the canonical postgres database or disposable qlmed_ci',
    );
  }

  return {
    databaseName,
    host: parsed.hostname || 'socket',
    port: parsed.port || '5432',
    protocol: parsed.protocol.slice(0, -1) as CanonicalDatabaseTarget['protocol'],
  };
}

export function validateCanonicalDatabaseConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CanonicalDatabaseTarget {
  const configuredLegacyVariables = Object.keys(env).filter(
    (name) => isLegacyDatabaseVariable(name) && env[name]?.trim(),
  );

  if (configuredLegacyVariables.length > 0) {
    throw new DatabaseConfigurationError(
      `Only DATABASE_URL may configure QLMED persistence; remove ${configuredLegacyVariables.join(', ')}`,
    );
  }

  const rawUrl = env.DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new DatabaseConfigurationError('DATABASE_URL is required');
  }

  return parseCanonicalDatabaseUrl(rawUrl);
}

export function getCanonicalDatabaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  validateCanonicalDatabaseConfig(env);
  return env.DATABASE_URL!.trim();
}
