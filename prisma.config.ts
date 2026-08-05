import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';
import { getCanonicalDatabaseUrl } from './src/lib/database-config';

// Load .env from project root (Prisma 7 no longer auto-loads .env)
dotenv.config({ path: path.join(__dirname, '.env') });

const databaseUrl = getCanonicalDatabaseUrl();

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: databaseUrl,
  },
});
