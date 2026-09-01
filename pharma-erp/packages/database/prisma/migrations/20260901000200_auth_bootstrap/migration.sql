-- =============================================================================
-- Auth bootstrap: resolving a user before their tenant is known
-- =============================================================================
-- The chicken-and-egg problem this solves:
--
--   A verified Clerk token tells us only the Clerk subject (its `sub` claim).
--   To learn the tenant we must read the matching row from "users" -- but every
--   policy on "users" requires app.current_tenant_id to already be set, and it
--   cannot be set until we have read that row. Under the tenant policy alone
--   the lookup returns zero rows and every request 401s.
--
-- Three ways out were considered:
--
--   1. Put the tenant id in the Clerk JWT as a custom claim. No database round
--      trip, but it requires a JWT-template step in the Clerk dashboard that no
--      code in this repo can verify, and a role baked into a token cannot be
--      revoked until that token expires. Rejected for now; see the note at the
--      bottom for how to adopt it later as an optimisation.
--   2. A separate, non-tenant-scoped lookup table (clerk_id -> tenant_id). No
--      new policy, but it duplicates data that already lives in "users" and can
--      silently drift out of sync with it.
--   3. A narrow additional SELECT policy on "users", below. One source of
--      truth, no dashboard configuration, and role changes take effect on the
--      next request -- which matters when revoking a Quality Officer's release
--      authority has to be immediate.
--
-- The policy is deliberately tight. It grants SELECT on a row only when:
--   * no tenant is set for the transaction (so it can never widen a normal,
--     tenant-scoped query -- those already have a tenant and take the other
--     policy's path), and
--   * the row's external_auth_id equals app.current_external_auth_id, which the
--     API sets ONLY from the `sub` of a token it has cryptographically verified.
--
-- So the worst it can expose is the single row belonging to the authenticated
-- caller -- which is exactly the row the caller is about to be identified as.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Accessor for the authenticated Clerk subject
-- -----------------------------------------------------------------------------

-- Mirrors public.current_tenant_id(). NULL when unset, which makes the
-- bootstrap policy below deny by default rather than match every row.
CREATE OR REPLACE FUNCTION public.current_external_auth_id()
RETURNS text
LANGUAGE sql
STABLE
-- SECURITY INVOKER (the default): must never run with the definer's rights.
SET search_path = pg_catalog, public
AS $fn$
  SELECT NULLIF(current_setting('app.current_external_auth_id', true), '');
$fn$;

COMMENT ON FUNCTION public.current_external_auth_id() IS
  'Verified Clerk subject for the current transaction, from app.current_external_auth_id. NULL when unset, which makes the users_auth_bootstrap policy match nothing.';

-- -----------------------------------------------------------------------------
-- 2. The bootstrap policy
-- -----------------------------------------------------------------------------
-- PostgreSQL ORs multiple permissive policies for the same command, so this
-- sits alongside users_tenant_isolation rather than replacing it: a query with
-- a tenant set is unaffected, and a query without one can see at most this row.

CREATE POLICY "users_auth_bootstrap" ON "users"
  FOR SELECT
  USING (
    -- Only when the transaction has no tenant. Without this guard the policy
    -- would also apply inside normal tenant-scoped queries, letting a caller
    -- read their own row from another tenant if they ever held two accounts.
    public.current_tenant_id() IS NULL
    AND "external_auth_id" IS NOT NULL
    AND "external_auth_id" = public.current_external_auth_id()
    -- A soft-deleted user is not an identity any more.
    AND "deleted_at" IS NULL
  );

COMMENT ON POLICY "users_auth_bootstrap" ON "users" IS
  'Lets the API resolve exactly one user row -- the authenticated Clerk subject''s -- before the tenant is known. Applies only when app.current_tenant_id is unset.';

-- -----------------------------------------------------------------------------
-- 3. Tenant readable during bootstrap
-- -----------------------------------------------------------------------------
-- GET /api/v1/me returns the tenant's name and slug alongside the user. That
-- read happens in the same untenanted transaction as the bootstrap lookup, so
-- the tenant row needs the equivalent narrow exception: visible only when it is
-- the tenant of the row the authenticated subject resolves to.

CREATE POLICY "tenants_auth_bootstrap" ON "tenants"
  FOR SELECT
  USING (
    public.current_tenant_id() IS NULL
    AND public.current_external_auth_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "users" u
      WHERE u."tenant_id" = "tenants"."id"
        AND u."external_auth_id" = public.current_external_auth_id()
        AND u."deleted_at" IS NULL
    )
  );

COMMENT ON POLICY "tenants_auth_bootstrap" ON "tenants" IS
  'Lets GET /me read the tenant of the authenticated subject before app.current_tenant_id is set. Applies only when that setting is unset.';

-- -----------------------------------------------------------------------------
-- 4. Grants
-- -----------------------------------------------------------------------------

DO $grants$
DECLARE
  v_role text := 'pharma_app';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    RAISE NOTICE 'Role % not present; skipping runtime grants.', v_role;
    RETURN;
  END IF;

  EXECUTE format('GRANT EXECUTE ON FUNCTION public.current_external_auth_id() TO %I', v_role);
END
$grants$;

-- -----------------------------------------------------------------------------
-- Future optimisation
-- -----------------------------------------------------------------------------
-- If the per-request bootstrap SELECT ever shows up in profiling, add tenant_id
-- as a custom claim in the Clerk JWT template and set app.current_tenant_id
-- straight from the verified token. Keep resolving the ROLE from this table
-- even then: a role in a token stays valid until the token expires, and an
-- authority revocation in a GxP system should not wait.
