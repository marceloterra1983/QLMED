#!/bin/sh
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/xml_backup /app/storage/xml_backup /app/storage/pdf_backup
  chown -R nextjs:nodejs /app/xml_backup /app/storage
  exec su-exec nextjs ./start.sh
fi

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL não configurada."
  exit 1
fi

case "$DATABASE_URL" in
  postgresql://*|postgres://*)
    ;;
  *)
    echo "DATABASE_URL inválida para produção (use postgresql:// ou postgres://)."
    exit 1
    ;;
esac

echo "Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy

if [ "${QLMED_REQUIRE_NONEMPTY_DB:-false}" = "true" ]; then
  echo "Running production database sanity check..."
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  const [users, companies] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
  ]);

  if (users === 0 || companies === 0) {
    console.error(
      `[QLMED] Database sanity check failed: users=${users}, companies=${companies}. Refusing to start.`,
    );
    process.exit(1);
  }

  console.log(`[QLMED] Database sanity check passed: users=${users}, companies=${companies}.`);
}

main()
  .catch((error) => {
    console.error('[QLMED] Failed to run database sanity check.', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE
fi

echo "Starting server..."
exec node server.js
