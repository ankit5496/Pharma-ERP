-- =============================================================================
-- Move authentication in-house
-- =============================================================================
-- Replaces the external identity provider (Clerk) with email + password
-- credentials held in this database.
--
-- Why: the product has no public signup. A platform operator creates a company
-- and its first Admin from a CLI, and that Admin creates every other user with
-- an assigned role. Nothing self-registers and there is no social login, so the
-- main argument for an external provider — OAuth, SSO, and the reset flows that
-- come with them — does not apply. Owning the credential records also keeps the
-- 21 CFR Part 11 evidence trail inside one database rather than split across a
-- vendor whose SOC 2 report would have to be qualified.
--
-- What this does NOT change: tenant isolation, the role model, or the audit
-- trail. Those never depended on the identity provider — Clerk only ever
-- answered "who is this person", and that is the single piece being replaced.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop the Clerk linkage
-- -----------------------------------------------------------------------------
-- The bootstrap policy keys on external_auth_id, so it has to go before the
-- column it references.

DROP POLICY IF EXISTS "users_auth_bootstrap" ON "users";
DROP POLICY IF EXISTS "tenants_auth_bootstrap" ON "tenants";
DROP FUNCTION IF EXISTS public.current_external_auth_id();

-- DropIndex
DROP INDEX "users_external_auth_id_key";

-- -----------------------------------------------------------------------------
-- 2. Credentials
-- -----------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "users" DROP COLUMN "external_auth_id",
ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password_hash" VARCHAR(255),
ADD COLUMN     "password_set_at" TIMESTAMPTZ(6);

-- Normalise before adding the global unique index, or two rows differing only
-- by case would collide and the index creation would fail on existing data.
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Enforce the lowercasing the application already does. Without this, a row
-- inserted by hand as "Bob@x.com" would sit alongside "bob@x.com" and the
-- login lookup — which lowercases its input — would silently miss one of them.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

COMMENT ON COLUMN "users"."password_hash" IS
  'argon2id hash. Null while status = INVITED. Must never appear in an API response: read it only with an explicit select.';

-- -----------------------------------------------------------------------------
-- 3. Login bootstrap policy
-- -----------------------------------------------------------------------------
-- Same chicken-and-egg as before, with a different key. A sign-in attempt
-- arrives with an email and no tenant; the tenant is what the lookup is trying
-- to discover, but every policy on "users" needs app.current_tenant_id to
-- already be set. So there is one narrow SELECT policy for that lookup, keyed on
-- a session variable the API sets from the submitted email.
--
-- The important difference from the Clerk version: that key was a subject id
-- from a verified token, whereas this one is an unauthenticated string typed by
-- whoever is at the login form. So the policy exposes exactly one row — the
-- account for an address the caller already named — and nothing else. It does
-- not confirm that the row exists (the API returns the same error either way)
-- and it grants no access to any other table. Guessing an address reveals no
-- more than guessing it against the login form itself.

CREATE OR REPLACE FUNCTION public.current_login_email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $fn$
  SELECT NULLIF(current_setting('app.current_login_email', true), '');
$fn$;

COMMENT ON FUNCTION public.current_login_email() IS
  'Email being authenticated in the current transaction, from app.current_login_email. NULL when unset, which makes users_login_lookup match nothing.';

CREATE POLICY "users_login_lookup" ON "users"
  FOR SELECT
  USING (
    -- Only when no tenant is set. Without this the policy would also widen
    -- ordinary tenant-scoped queries.
    public.current_tenant_id() IS NULL
    AND "email" = public.current_login_email()
    AND "deleted_at" IS NULL
  );

COMMENT ON POLICY "users_login_lookup" ON "users" IS
  'Lets the API resolve one account by email during sign-in, before the tenant is known. Applies only when app.current_tenant_id is unset.';

-- GET /me and the login response return the tenant's name and slug, read in the
-- same untenanted transaction, so the tenant row needs the matching exception.
CREATE POLICY "tenants_login_lookup" ON "tenants"
  FOR SELECT
  USING (
    public.current_tenant_id() IS NULL
    AND public.current_login_email() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "users" u
      WHERE u."tenant_id" = "tenants"."id"
        AND u."email" = public.current_login_email()
        AND u."deleted_at" IS NULL
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Grants
-- -----------------------------------------------------------------------------
-- The login path updates failed_login_attempts, locked_until and last_login_at,
-- and change-password updates password_hash — all of which the runtime role
-- already has UPDATE on from migration 20260901000100.

DO $grants$
DECLARE
  v_role text := 'pharma_app';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    RAISE NOTICE 'Role % not present; skipping runtime grants.', v_role;
    RETURN;
  END IF;

  EXECUTE format('GRANT EXECUTE ON FUNCTION public.current_login_email() TO %I', v_role);
END
$grants$;
