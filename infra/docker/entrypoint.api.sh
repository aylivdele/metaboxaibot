#!/bin/sh
set -e

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations)" ]; then
  echo "Applying pending migrations..."
  # Run migrate deploy and capture output for error detection
  if ! npx prisma migrate deploy 2>&1 | tee /tmp/migrate_out.txt; then
    if grep -q "P3005" /tmp/migrate_out.txt; then
      echo "Database has no migration history (was created via db push) — baselining..."
      for dir in prisma/migrations/*/; do
        migration_name=$(basename "$dir")
        echo "  Marking as applied: $migration_name"
        npx prisma migrate resolve --applied "$migration_name" 2>/dev/null || true
      done
      echo "Baselining complete. Syncing any schema drift..."
      npx prisma db push --accept-data-loss
    else
      cat /tmp/migrate_out.txt
      exit 1
    fi
  fi
else
  echo "No migration files found — syncing schema with db push..."
  npx prisma db push --accept-data-loss
fi

echo "Starting API server..."
exec node packages/api/dist/index.js
