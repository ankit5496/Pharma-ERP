#!/bin/bash
# Runs once, on first initialisation of the Postgres data volume, as the
# superuser against "$POSTGRES_DB".
#
# Purpose: create the least-privilege application role that the API connects as.
# PostgreSQL exempts superusers and (by default) table owners from Row-Level
# Security, so if the API connected as `postgres` the RLS policies in
# packages/database/prisma/migrations would be silently inert. The migrations
# additionally mark every tenant-scoped table FORCE ROW LEVEL SECURITY, which
# closes the table-owner loophole as well.
set -euo pipefail

APP_USER="${APP_DB_USER:-pharma_app}"
APP_PASSWORD="${APP_DB_PASSWORD:-pharma_app_dev_password}"

# Guard against SQL injection through the compose env vars, and against role
# names that would need quoting gymnastics below.
if [[ ! "$APP_USER" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "[init] FATAL: APP_DB_USER must match ^[a-z_][a-z0-9_]*$ (got '$APP_USER')" >&2
  exit 1
fi
if [[ "$APP_PASSWORD" == *"'"* ]]; then
  echo "[init] FATAL: APP_DB_PASSWORD must not contain a single quote" >&2
  exit 1
fi

psql_super() {
  psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$@"
}

role_exists=$(psql_super -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}'")

if [[ "$role_exists" == "1" ]]; then
  psql_super -c "ALTER ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS"
else
  psql_super -c "CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS"
fi

psql_super <<SQL
-- The app role may use the schema but never create objects in it: all DDL goes
-- through \`prisma migrate\` on the migration (superuser) connection.
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO ${APP_USER};
GRANT USAGE ON SCHEMA public TO ${APP_USER};
REVOKE CREATE ON SCHEMA public FROM ${APP_USER};
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Tables that already exist (none on a first boot, but keeps re-runs correct).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_USER};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER};

-- Tables created LATER by migrations (which run as ${POSTGRES_USER}) are granted
-- to the app role automatically, so no future migration has to remember to.
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_USER};
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${APP_USER};
SQL

echo "[init] application role '${APP_USER}' provisioned (NOSUPERUSER, NOBYPASSRLS)."
