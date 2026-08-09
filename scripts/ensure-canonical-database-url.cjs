'use strict';

/**
 * Fail-closed gate for maintenance scripts: runs the single FR-005 resolver
 * (validate-database-config.mjs → src/lib/database-config.ts) before any
 * PrismaClient open. CJS-friendly for plain `node scripts/*.js`.
 */
const { execFileSync } = require('child_process');
const path = require('path');

try {
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'validate-database-config.mjs')],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: process.env,
    },
  );
} catch (err) {
  process.exit(typeof err.status === 'number' ? err.status : 1);
}
