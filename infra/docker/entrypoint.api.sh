#!/bin/sh
set -e

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations)" ]; then
  echo "Applying pending migrations..."
  if ! npx prisma migrate deploy 2>&1 | tee /tmp/migrate_out.txt; then
    if grep -q "P3005" /tmp/migrate_out.txt; then
      # Database was created via db push and has no migration history at all —
      # mark every migration as already applied, then sync any remaining drift.
      echo "Database has no migration history (was created via db push) — baselining..."
      for dir in prisma/migrations/*/; do
        migration_name=$(basename "$dir")
        echo "  Marking as applied: $migration_name"
        npx prisma migrate resolve --applied "$migration_name" 2>/dev/null || true
      done
      echo "Baselining complete. Syncing any schema drift..."
      npx prisma db push --accept-data-loss
    elif grep -q "P3018" /tmp/migrate_out.txt && grep -q "00000000000000_init" /tmp/migrate_out.txt; then
      # The init migration failed because the schema was created before migrations
      # were introduced (tables already exist). Mark it as resolved and retry.
      echo "Init migration conflicts with existing schema — marking as applied and retrying..."
      npx prisma migrate resolve --applied "00000000000000_init"
      npx prisma migrate deploy
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
