-- =============================================================================
-- Platform layer: Super Users who create companies
-- =============================================================================
-- Adds a tier ABOVE the tenant model. The hierarchy is now:
--
--   PlatformUser (vendor staff)
--     -> Tenant (customer company)
--          -> User (ADMIN, then everyone the Admin creates)
--
-- WHY A SEPARATE TABLE, not a SUPER_ADMIN role in `users`
-- ------------------------------------------------------
-- The requirement is that an Admin must never see platform staff in their user
-- management. With a separate table that holds structurally: an Admin's queries
-- run against `users` and cannot reach `platform_users` at all. A role inside
-- `users` would make it a filter that every present and future query has to
-- remember, and one forgotten `WHERE role <> 'SUPER_ADMIN'` exposes the vendor's
-- staff list to a customer.
--
-- It also keeps `users.tenant_id` NOT NULL. A platform user belongs to no
-- tenant, so the role approach would have forced that column nullable -- and
-- every RLS policy in this database compares against it.
--
-- HOW ISOLATION IS ENFORCED HERE
-- ------------------------------
-- These tables are not tenant-scoped, so row-level security is the wrong tool:
-- there is no tenant column to compare. Privileges are used instead. The runtime
-- role `pharma_app` is REVOKEd entirely, so a request-scoped connection gets a
-- hard "permission denied for table platform_users" rather than an empty
-- result -- a louder and less ambiguous failure than RLS would give.
--
-- Only the provisioning connection (MIGRATION_DATABASE_URL) can touch them,
-- which is the same connection that already creates tenants.
--
-- Note the REVOKE is not optional: migration 20260901000100 set ALTER DEFAULT
-- PRIVILEGES granting pharma_app SELECT/INSERT/UPDATE/DELETE on every future
-- table, so without an explicit REVOKE these would be readable by the app.
-- =============================================================================

-- CreateEnum
CREATE TYPE "PlatformUserStatus" AS ENUM ('ACTIVE', 'DISABLED');
-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32),
    "status" "PlatformUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "password_hash" VARCHAR(255),
    "password_set_at" TIMESTAMPTZ(6),
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "platform_user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "details_json" JSONB,
    "request_id" VARCHAR(64),
    "ip_address" INET,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");
-- CreateIndex
CREATE INDEX "platform_users_deleted_at_idx" ON "platform_users"("deleted_at");
-- CreateIndex
CREATE INDEX "platform_audit_logs_created_at_idx" ON "platform_audit_logs"("created_at");
-- CreateIndex
CREATE INDEX "platform_audit_logs_platform_user_id_created_at_idx" ON "platform_audit_logs"("platform_user_id", "created_at");
-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Constraints matching the tenant-user table
-- -----------------------------------------------------------------------------

-- Sign-in lowercases its input, so a row inserted by hand as "Ops@vendor.com"
-- would be unreachable. Enforce what the application already does.
ALTER TABLE "platform_users"
  ADD CONSTRAINT "platform_users_email_lowercase" CHECK ("email" = lower("email"));

COMMENT ON COLUMN "platform_users"."password_hash" IS
  'argon2id hash. Must never appear in an API response: read it only with an explicit select.';

-- -----------------------------------------------------------------------------
-- Keep the runtime role out
-- -----------------------------------------------------------------------------

DO $lockout$
DECLARE
  v_role text := 'pharma_app';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    RAISE NOTICE 'Role % not present; skipping platform-table revocations.', v_role;
    RETURN;
  END IF;

  EXECUTE format('REVOKE ALL ON TABLE "platform_users" FROM %I', v_role);
  EXECUTE format('REVOKE ALL ON TABLE "platform_audit_logs" FROM %I', v_role);
  EXECUTE format('REVOKE ALL ON SEQUENCE "platform_audit_logs_id_seq" FROM %I', v_role);

  RAISE NOTICE 'Runtime role % has no access to the platform tables.', v_role;
END
$lockout$;

-- -----------------------------------------------------------------------------
-- Compliance guards, same as the tenant tables
-- -----------------------------------------------------------------------------

-- A platform user who created companies is part of the record; removal is a
-- soft delete. Reuses the trigger function from migration 20260901000100.
CREATE TRIGGER "platform_users_no_hard_delete"
  BEFORE DELETE ON "platform_users"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- The platform trail is append-only for the same reason the tenant one is: a
-- record of who provisioned or suspended a company is worthless if it can be
-- edited afterwards.
CREATE TRIGGER "platform_audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "platform_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();
