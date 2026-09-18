#!/usr/bin/env node
/** Probe Omarchy→vps2 postgres tunnel without printing credentials. */
import { readFileSync } from 'node:fs';
import net from 'node:net';
import pg from 'pg';

function loadDatabaseUrl() {
  const text = readFileSync('/home/marce/qlmed/app/.env', 'utf8');
  for (const line of text.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
      return line.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error('DATABASE_URL ausente em app/.env');
}

function tcpOpen(host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port, timeout: 2000 }, () => {
      sock.end();
      resolve();
    });
    sock.on('error', reject);
    sock.on('timeout', () => {
      sock.destroy();
      reject(new Error('timeout'));
    });
  });
}

try {
  await tcpOpen('127.0.0.1', 5435);
} catch {
  console.error('TUNNEL_DOWN');
  process.exit(1);
}

const raw = loadDatabaseUrl();
const parsed = new URL(raw);
const host = parsed.hostname;
const port = parsed.port || '5432';
const db = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0]);
if (!['127.0.0.1', 'localhost', '::1'].includes(host) || port !== '5435' || db !== 'postgres') {
  console.error('TUNNEL_WRONG_TARGET');
  process.exit(1);
}

const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const { rows } = await client.query('SELECT current_database() AS name');
  if (rows[0]?.name !== 'postgres') {
    console.error('TUNNEL_WRONG_DB');
    process.exit(1);
  }
  console.log('TUNNEL_OK');
} finally {
  await client.end().catch(() => {});
}
