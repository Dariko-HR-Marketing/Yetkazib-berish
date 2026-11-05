#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL to be ready..."
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));
"; do
  echo "PostgreSQL is not ready yet - retrying in 2 seconds..."
  sleep 2
done
echo "==> PostgreSQL is ready!"

echo "==> Applying migrations and seed..."
node dist/db/migrate-cli.js

echo "==> Starting API server..."
exec "$@"
