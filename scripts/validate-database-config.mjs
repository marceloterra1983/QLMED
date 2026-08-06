#!/usr/bin/env node

/**
 * CLI gate for canonical DATABASE_URL. Delegates to the single TypeScript
 * resolver in src/lib/database-config.ts (FR-005) — no parallel rule copy.
 */
import {
  DatabaseConfigurationError,
  validateCanonicalDatabaseConfig,
} from '../src/lib/database-config.ts';

try {
  validateCanonicalDatabaseConfig();
  console.log('QLMED database configuration is canonical (DATABASE_URL only).');
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
