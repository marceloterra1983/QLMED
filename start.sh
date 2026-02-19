#!/bin/sh
set -e

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

echo "Starting server..."
exec node server.js
