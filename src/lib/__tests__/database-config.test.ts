import {
  DatabaseConfigurationError,
  parseCanonicalDatabaseUrl,
  validateCanonicalDatabaseConfig,
} from '@/lib/database-config';
import { describe, expect, it } from 'vitest';

describe('canonical database configuration', () => {
  it('accepts the persistent QLMED database URL without exposing credentials', () => {
    expect(
      parseCanonicalDatabaseUrl(
        'postgresql://user@db.internal:5432/postgres?schema=public',
      ),
    ).toEqual({
      databaseName: 'postgres',
      host: 'db.internal',
      port: '5432',
      protocol: 'postgresql',
    });
  });

  it('accepts the disposable CI database', () => {
    expect(
      validateCanonicalDatabaseConfig({
        DATABASE_URL: 'postgresql://postgres@127.0.0.1:5433/qlmed_ci',
      }),
    ).toMatchObject({ databaseName: 'qlmed_ci' });
  });

  it('rejects the removed qlmed_dev target', () => {
    expect(() =>
      parseCanonicalDatabaseUrl(
        'postgresql://user@localhost:5432/qlmed_dev',
      ),
    ).toThrowError(DatabaseConfigurationError);
  });

  it('rejects an unregistered persistent database name', () => {
    expect(() =>
      parseCanonicalDatabaseUrl('postgresql://user@localhost:5432/other'),
    ).toThrow('canonical postgres database or disposable qlmed_ci');
  });

  it('rejects parallel database URL aliases', () => {
    expect(() =>
      validateCanonicalDatabaseConfig({
        DATABASE_URL: 'postgresql://user@localhost:5432/postgres',
        DATABASE_URL_TEST: 'postgresql://user@localhost:5432/other',
      }),
    ).toThrow('Only DATABASE_URL may configure QLMED persistence');
  });

  it('rejects non-PostgreSQL URLs without echoing the value', () => {
    expect(() =>
      parseCanonicalDatabaseUrl('https://user@example.invalid/qlmed'),
    ).toThrow('postgres or postgresql scheme');
  });
});
