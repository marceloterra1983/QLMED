#!/usr/bin/env node

/**
 * CLI gate for canonical DATABASE_URL. Delegates to the single TypeScript
 * resolver in src/lib/database-config.ts (FR-005) — no parallel rule copy.
 */
import {
  DatabaseConfigurationError,
  validateCanonicalDatabaseConfig,
  assertDisposableCiReplay,
} from '../src/lib/database-config.ts';

const ciReplay = process.argv.includes('--ci-replay');

try {
  if (ciReplay) {
    assertDisposableCiReplay();
    console.log('QLMED database configuration is disposable qlmed_ci (replay).');
  } else {
    validateCanonicalDatabaseConfig();
    console.log('QLMED database configuration is canonical (DATABASE_URL only).');
  }
} catch (error) {
  const message =
    error instanceof DatabaseConfigurationError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  console.error(`[QLMED] Database configuration invalid: ${message}`);
  process.exit(1);
}
