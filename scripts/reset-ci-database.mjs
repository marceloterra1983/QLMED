#!/usr/bin/env node
/**
 * Reset the long-lived sidecar database between CI jobs (SPEC-013).
 * schema=public is shared; equivalent to DROP/CREATE DATABASE without CREATEDB.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL is required to reset the CI database');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO qlmed_ci');
  console.log('CI database schema public reset');
} finally {
  await client.end().catch(() => {});
}
