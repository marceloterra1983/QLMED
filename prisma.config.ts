import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';
import { validateCanonicalDatabaseConfig } from './src/lib/database-config';

// Load .env from project root (Prisma 7 no longer auto-loads .env)
dotenv.config({ path: path.join(__dirname, '.env') });

const hasLegacyDatabaseConfiguration = Object.keys(process.env).some(
  (name) =>
    name !== 'DATABASE_URL' &&
    (name.startsWith('DATABASE_URL_') || /^QLMED_.*DATABASE_URL$/.test(name)) &&
    process.env[name]?.trim(),
);

if (process.env.DATABASE_URL?.trim() || hasLegacyDatabaseConfiguration) {
  validateCanonicalDatabaseConfig();
}

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
