-- =============================================================================
-- One-time bootstrap for a managed PostgreSQL (Render, Neon, RDS, Supabase…)
-- =============================================================================
-- Creates the least-privilege role the API connects as at runtime.
--
-- Run it ONCE, as the database owner, after the database exists and BEFORE the
-- first deploy. On Render:
--
--   psql "<External Database URL from the Render dashboard>" -f scripts/render-bootstrap.sql
--
-- Then set DATABASE_URL on the API service to the same connection string with
-- the username and password swapped for pharma_app's, keeping ?sslmode=require.
--
-- WHY THIS EXISTS
-- ---------------
-- PostgreSQL exempts two kinds of connection from row-level security: superusers
-- (always) and the table owner (unless the table is FORCE'd). A managed database
-- gives you an owner, and if the API connected as that owner, every RLS policy
-- in packages/database/prisma/migrations would still hold for `users` and
-- `audit_logs` (they are FORCE'd) but the owner could also simply turn FORCE
-- off, since it owns the tables. A separate non-owner role removes that option
-- entirely, and costs one SQL script.
--
-- Order matters: run this AFTER `prisma migrate deploy` has created the tables,
-- or the table-level grants below have nothing to grant on. The ALTER DEFAULT
-- PRIVILEGES statements cover tables added by later migrations automatically.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- 1. Change this before running
-- -----------------------------------------------------------------------------
-- Use a long random value. It ends up in DATABASE_URL, which Render stores as a
-- secret, so it never needs to be memorable.
\set app_password 'CHANGE_ME_before_running'

-- -----------------------------------------------------------------------------
-- 2. The role
-- -----------------------------------------------------------------------------

-- NOTE ON STYLE: the password is interpolated with psql's `:'var'` at the top
-- level and never inside a DO block. psql does not perform variable
-- substitution within dollar-quoted strings, so `:'app_password'` inside
-- `$$ … $$` is a syntax error rather than the value — an easy trap, and the
-- reason this section uses \if instead of PL/pgSQL branching.

-- The guard tests the SHAPE of the value rather than comparing it to the
-- placeholder literal. Comparing to the literal would be defeated by the most
-- obvious way to edit this file — a find-and-replace on the placeholder, which
-- would rewrite the comparison too and make the check trivially true.
SELECT
  (length(:'app_password') < 16 OR :'app_password' ILIKE '%change%me%') AS is_weak
\gset

\if :is_weak
DO $guard$
BEGIN
  RAISE EXCEPTION
    'app_password at the top of scripts/render-bootstrap.sql is still the placeholder, or is shorter than 16 characters. Set a long random value first.';
END
$guard$;
\endif

-- `can_alter` matters because CREATEROLE alone is not enough to modify a role
-- somebody else created: PostgreSQL also requires the ADMIN option on it. That
-- happens when the same role that runs this script created pharma_app, which is
-- the normal case on a fresh database — but not if it was created by hand from a
-- different account.
SELECT
  NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharma_app') AS must_create,
  COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)
    OR EXISTS (
      SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles granted ON granted.oid = m.roleid
      JOIN pg_roles grantee ON grantee.oid = m.member
      WHERE granted.rolname = 'pharma_app'
        AND grantee.rolname = current_user
        AND m.admin_option
    ) AS can_alter
\gset

-- NOSUPERUSER, NOCREATEDB, NOCREATEROLE and NOBYPASSRLS are all PostgreSQL's
-- defaults for a new role, and they are deliberately NOT spelled out here:
-- only a superuser may set the SUPERUSER or BYPASSRLS attribute — even to the
-- negative — so naming them makes this script fail on exactly the managed
-- databases it is written for ("permission denied to alter role"). The
-- verification step at the bottom checks the resulting flags instead, which is
-- the part that actually matters.
\if :must_create
CREATE ROLE pharma_app LOGIN PASSWORD :'app_password';
\echo '  created role pharma_app'
\elif :can_alter
-- Re-runnable: refresh the password only.
ALTER ROLE pharma_app LOGIN PASSWORD :'app_password';
\echo '  role pharma_app already existed; password updated'
\else
\echo '  NOTE: pharma_app already exists and this role cannot alter it (no ADMIN option).'
\echo '        Keeping its current password. The grants below still apply.'
\echo '        If you need to change the password, do it from the role that created it.'
\endif

-- -----------------------------------------------------------------------------
-- 3. Privileges
-- -----------------------------------------------------------------------------
-- Mirrors docker/postgres/init/01-roles.sh and the grants in migration
-- 20260901000100. Kept idempotent so re-running after a schema change is safe.

-- GRANT ... ON DATABASE needs a literal name, so the current one is formatted in.
DO $connect$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO pharma_app', current_database());
END
$connect$;

GRANT USAGE ON SCHEMA public TO pharma_app;

-- No object creation: all DDL goes through `prisma migrate deploy` on the owner.
REVOKE CREATE ON SCHEMA public FROM pharma_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pharma_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pharma_app;

-- audit_logs is append-only. Withholding UPDATE/DELETE at the privilege level
-- means that guarantee does not rest on the trigger alone.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM pharma_app;

-- Tables added by future migrations get the same treatment without anyone
-- having to remember. `current_user` here is the owner running this script.
DO $defaults$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pharma_app', current_user);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'GRANT USAGE, SELECT ON SEQUENCES TO pharma_app', current_user);
END
$defaults$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO pharma_app;
GRANT EXECUTE ON FUNCTION public.require_tenant_id() TO pharma_app;
GRANT EXECUTE ON FUNCTION public.current_external_auth_id() TO pharma_app;

-- -----------------------------------------------------------------------------
-- 4. Verify
-- -----------------------------------------------------------------------------
-- If either of these looks wrong, stop and fix it before deploying: an app role
-- that is a superuser or has BYPASSRLS makes every policy in this database
-- decorative.

-- Fail loudly rather than printing a table nobody reads. An app role that is a
-- superuser or holds BYPASSRLS makes every policy in this database decorative,
-- and that must not be something you discover later.
DO $verify$
DECLARE
  v_super   boolean;
  v_bypass  boolean;
BEGIN
  SELECT rolsuper, rolbypassrls INTO v_super, v_bypass
  FROM pg_roles WHERE rolname = 'pharma_app';

  IF v_super OR v_bypass THEN
    RAISE EXCEPTION
      'pharma_app has superuser=% bypassrls=%; it must have neither, or row-level security will not apply to the application. A superuser must fix this with: ALTER ROLE pharma_app NOSUPERUSER NOBYPASSRLS;',
      v_super, v_bypass;
  END IF;

  RAISE NOTICE 'pharma_app verified: not a superuser, does not bypass RLS.';
END
$verify$;

SELECT
  relname                AS table_name,
  relrowsecurity         AS rls_enabled,
  relforcerowsecurity    AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('tenants', 'users', 'audit_logs')
ORDER BY relname;

-- Expected:
--   pharma_app | false | false
--   audit_logs | true  | true
--   tenants    | true  | false   <- not forced ON PURPOSE (migration 20260901000300)
--   users      | true  | true
--
-- Then confirm the whole thing end to end with:
--   pnpm verify:rls
-- pointed at this database. It asserts 25 properties and refuses to run if
-- DATABASE_URL and MIGRATION_DATABASE_URL are the same connection.
