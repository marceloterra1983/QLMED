#!/usr/bin/env node
/**
 * Preview DEV canônico QLMED — Next em :3002.
 * Worktree: /home/marce/qlmed/.worktrees/preview
 * Unit: systemctl --user start qlmed-dev-preview
 * URL: Tailscale :3002 (QLMED_PREVIEW_ORIGIN ou `tailscale ip -4`)
 *
 * Env: ~/qlmed/app/.env (nunca /srv/qlmed/env/app.env neste host).
 * DATABASE_URL: túnel 127.0.0.1:5435 → vps2 postgres (ADR-0020).
 * Override: QLMED_PREVIEW_CWD, QLMED_PREVIEW_ENV, QLMED_PREVIEW_ORIGIN
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  DEFAULT_DEV_ENV_CANDIDATES,
  assertPreviewDatabaseUrl,
  pickEnvFile,
  resolvePreviewOrigin,
} from './qlmed-dev-preview-env.mjs';

const envFile = pickEnvFile([
  process.env.QLMED_PREVIEW_ENV,
  ...DEFAULT_DEV_ENV_CANDIDATES,
]);
process.loadEnvFile(envFile);

assertPreviewDatabaseUrl(process.env.DATABASE_URL);

function tailscaleIpv4() {
  const r = spawnSync('tailscale', ['ip', '-4'], { encoding: 'utf8' });
  if (r.status !== 0) return '';
  return (r.stdout || '').trim().split(/\s+/)[0] || '';
}

const origin = resolvePreviewOrigin({
  override: process.env.QLMED_PREVIEW_ORIGIN,
  tailscaleIp: tailscaleIpv4(),
});

const cwd =
  process.env.QLMED_PREVIEW_CWD || '/home/marce/qlmed/.worktrees/preview';

const env = {
  ...process.env,
  NEXTAUTH_URL: origin,
  PORT: '3002',
  HOST: '0.0.0.0',
  DAILY_SUMMARY_NATIVE: '0',
  QLMED_DISABLE_BACKGROUND_SERVICES: 'true',
};

const child = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', '3002'], {
  cwd,
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
