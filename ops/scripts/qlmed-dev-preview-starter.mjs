#!/usr/bin/env node
/**
 * Preview DEV canônico QLMED — Next em :3002.
 * Worktree: /home/marce/qlmed/.worktrees/preview
 * Unit: systemctl --user start qlmed-dev-preview
 * URL: http://100.83.11.58:3002
 *
 * Override opcional: QLMED_PREVIEW_CWD=/path/to/feature-worktree
 */
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';

process.loadEnvFile('/srv/qlmed/env/app.env');

let dbUrl = process.env.DATABASE_URL || '';
try {
  await dns.lookup('qlmed-db');
} catch {
  dbUrl = dbUrl.replace('qlmed-db', '127.0.0.1');
}

const cwd =
  process.env.QLMED_PREVIEW_CWD || '/home/marce/qlmed/.worktrees/preview';

const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  NEXTAUTH_URL: 'http://100.83.11.58:3002',
  PORT: '3002',
  HOST: '0.0.0.0',
  // Preview nunca dispara WhatsApp/jobs de produção (resumo diário etc.).
  DAILY_SUMMARY_NATIVE: '0',
  QLMED_DISABLE_BACKGROUND_SERVICES: 'true',
};

const child = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', '3002'], {
  cwd,
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
