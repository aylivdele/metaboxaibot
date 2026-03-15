#!/bin/sh
set -e

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations)" ]; then
  echo "Applying pending migrations..."
  npx prisma migrate deploy
else
  echo "No migration files found — syncing schema with db push..."
  npx prisma db push --accept-data-loss
fi

echo "Starting API server..."
exec node packages/api/dist/index.js
