-- =============================================================================
-- Row-Level Security, tenant isolation, and compliance write-guards
-- =============================================================================
-- This migration is hand-written (Prisma cannot express RLS in schema.prisma)
-- and is the security boundary of the whole application. Application-level
-- "where: { tenantId }" filters are a SECOND layer of defence; if they are ever
-- forgotten, the policies below still return zero rows.
--
-- How the tenant reaches the database:
--   1. The API resolves the caller's tenant (auth) once per request.
--   2. Before any query on that connection it runs
--        SELECT set_config('app.current_tenant_id', '<uuid>', true)
--      inside the transaction that carries the query (see
--      packages/database/src/tenant-scope.ts).
--   3. Every policy below compares the row's tenant against
--      public.current_tenant_id(), which reads that setting.
--
-- Fail-closed by construction: if step 2 is skipped the setting is NULL, every
-- comparison evaluates to NULL, and the row is neither visible nor insertable.
--
-- Why this works at all: the API connects as the non-superuser, non-owner role
-- pharma_app (created by docker/postgres/init/01-roles.sh). Superusers bypass
-- RLS unconditionally, and table owners bypass it unless the table is marked
-- FORCE ROW LEVEL SECURITY -- which every statement below does.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tenant accessor
-- -----------------------------------------------------------------------------

-- Returns the tenant id for the current transaction, or NULL if none was set.
-- STABLE (not IMMUTABLE) so the planner may cache it within a statement but
-- never across the transaction boundary. The "true" second argument to
-- current_setting means "return NULL instead of raising when unset", which is
-- what makes the unset case fail closed rather than fail loud.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
-- SECURITY INVOKER (the default) is important here: this must never run with
-- the definer's elevated rights.
SET search_path = pg_catalog, public
AS $fn$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$fn$;

COMMENT ON FUNCTION public.current_tenant_id() IS
  'Tenant id for the current transaction, read from the app.current_tenant_id setting. NULL when unset, which makes every RLS policy deny by default.';

-- Same value, but raises instead of returning NULL. Used in WITH CHECK clauses
-- so a missing tenant context surfaces as a loud error during development
-- rather than a silently-misfiled or silently-rejected row.
CREATE OR REPLACE FUNCTION public.require_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_tenant uuid := public.current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'app.current_tenant_id is not set for this transaction'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Use the tenant-scoped Prisma client (forTenant) so the session variable is set.';
  END IF;
  RETURN v_tenant;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 2. Append-only / no-hard-delete guards
-- -----------------------------------------------------------------------------
-- Generic trigger functions, attached per table. Future migrations that add a
-- compliance-relevant table (Batch, PurchaseInvoice, SalesInvoice, ...) attach
-- public.prevent_hard_delete() rather than re-inventing the rule.

-- Blocks UPDATE and DELETE outright: the row is immutable once written.
CREATE OR REPLACE FUNCTION public.enforce_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  RAISE EXCEPTION '% on %.% is not permitted: this table is append-only',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

-- Blocks DELETE only, directing callers to the soft-delete column instead.
CREATE OR REPLACE FUNCTION public.prevent_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  RAISE EXCEPTION 'DELETE on %.% is not permitted: set deleted_at instead (soft delete)',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 3. tenants
-- -----------------------------------------------------------------------------
-- The tenant table has no tenant_id column -- its own primary key IS the tenant
-- id, so the policy compares the id column instead.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

-- A tenant can read and update only its own row.
CREATE POLICY "tenants_isolation_select" ON "tenants"
  FOR SELECT
  USING ("id" = public.current_tenant_id());

CREATE POLICY "tenants_isolation_update" ON "tenants"
  FOR UPDATE
  USING ("id" = public.current_tenant_id())
  WITH CHECK ("id" = public.current_tenant_id());

-- No INSERT or DELETE policy: provisioning and de-provisioning tenants is a
-- platform operation performed on the migration/admin connection, never by the
-- request-scoped application role. An absent policy means denied.

-- Tenants are retained for the statutory period; removal is a soft delete.
CREATE TRIGGER "tenants_no_hard_delete"
  BEFORE DELETE ON "tenants"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- -----------------------------------------------------------------------------
-- 4. users
-- -----------------------------------------------------------------------------

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "users_tenant_isolation" ON "users"
  FOR ALL
  -- Rows the caller may see or modify.
  USING ("tenant_id" = public.current_tenant_id())
  -- Rows the caller may write.
  WITH CHECK ("tenant_id" = public.require_tenant_id());

CREATE TRIGGER "users_no_hard_delete"
  BEFORE DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- -----------------------------------------------------------------------------
-- 5. audit_logs
-- -----------------------------------------------------------------------------

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

-- Readable within the tenant...
CREATE POLICY "audit_logs_tenant_isolation_select" ON "audit_logs"
  FOR SELECT
  USING ("tenant_id" = public.current_tenant_id());

-- ...and insertable within the tenant. There is deliberately no UPDATE or
-- DELETE policy.
CREATE POLICY "audit_logs_tenant_isolation_insert" ON "audit_logs"
  FOR INSERT
  WITH CHECK ("tenant_id" = public.require_tenant_id());

-- Belt and braces: the trigger fires even for a role that somehow acquires an
-- UPDATE/DELETE policy or privilege later.
CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();

-- -----------------------------------------------------------------------------
-- 6. Privileges for the runtime role
-- -----------------------------------------------------------------------------
-- In local development docker/postgres/init/01-roles.sh has already granted
-- broad table privileges plus ALTER DEFAULT PRIVILEGES for future tables. This
-- block makes the intent explicit and idempotent so the same migration is
-- correct on a managed Postgres where that init script never ran. It is a no-op
-- when the role does not exist (e.g. a CI database that uses a single role).

DO $grants$
DECLARE
  v_role text := 'pharma_app';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    RAISE NOTICE 'Role % not present; skipping runtime grants.', v_role;
    RETURN;
  END IF;

  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "tenants" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "users" TO %I', v_role);

  -- audit_logs: insert and read only. Withholding UPDATE/DELETE at the
  -- privilege level means the append-only guarantee does not rest on the
  -- trigger alone.
  EXECUTE format('GRANT SELECT, INSERT ON TABLE "audit_logs" TO %I', v_role);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_logs" FROM %I', v_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE "audit_logs_id_seq" TO %I', v_role);

  EXECUTE format('GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO %I', v_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.require_tenant_id() TO %I', v_role);
END
$grants$;
