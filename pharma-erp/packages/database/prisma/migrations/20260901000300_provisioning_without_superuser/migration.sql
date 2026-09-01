-- =============================================================================
-- Make tenant provisioning work without a superuser
-- =============================================================================
-- The problem this fixes, found by running the migrations as a non-superuser
-- database owner (which is what every managed Postgres gives you — Render,
-- Neon, Supabase, RDS):
--
--   20260901000100 marked `tenants` FORCE ROW LEVEL SECURITY, which extends row
--   security to the table OWNER, and gave it no INSERT policy. Locally that was
--   invisible because the provisioning connection is the `postgres` superuser,
--   and superusers bypass RLS unconditionally. On a managed database there is no
--   superuser, so the owner is subject to the policies too and:
--
--     INSERT INTO tenants ... -> ERROR: new row violates row-level security policy
--     SELECT count(*) FROM tenants -> 0
--
--   i.e. company signup fails outright and the slug-availability check silently
--   reports every slug as free.
--
-- The fix is to drop FORCE from `tenants` only. What that does and does not cost:
--
--   * FORCE affects ONLY the table owner. `pharma_app` is not the owner, so
--     `ENABLE ROW LEVEL SECURITY` alone still constrains it completely — the
--     tenant-isolation policy applies to every query it makes, exactly as before.
--     Nothing about the runtime security posture changes.
--   * The owner — used solely by OnboardingService on MIGRATION_DATABASE_URL —
--     regains the ability to create and read tenants, which is inherently a
--     cross-tenant operation and cannot be expressed as a tenant-scoped policy.
--
-- `users` and `audit_logs` KEEP FORCE. Provisioning still has to insert the first
-- Admin into `users`, and it does so by setting app.current_tenant_id to the
-- tenant it just created, inside the same transaction — so the existing
-- WITH CHECK passes on its own terms rather than by exemption. That is the
-- stronger arrangement, and it means that even if the application were ever
-- misconfigured to run as the owner, user rows and audit rows would still be
-- tenant-isolated.
--
-- The alternatives considered and rejected:
--   * A dedicated `pharma_provisioner` role with INSERT policies on `tenants`.
--     More moving parts, another role to create on every deployment target, and
--     it needs CREATEROLE — which not every managed provider grants.
--   * A SECURITY DEFINER provisioning function. FORCE RLS applies to the
--     definer too when the definer is the table owner, so it does not help.
-- =============================================================================

ALTER TABLE "tenants" NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE "tenants" IS
  'Root of the multi-tenancy tree. RLS is ENABLED but deliberately not FORCED: the table owner (the migration/provisioning connection) must be able to create and list tenants, which is inherently cross-tenant. The runtime role pharma_app is not the owner, so it remains fully constrained by tenants_isolation_select/update.';

-- -----------------------------------------------------------------------------
-- Guard: prove the runtime role is still constrained
-- -----------------------------------------------------------------------------
-- A cheap self-check so this migration cannot quietly become the thing that
-- disabled tenant isolation. If RLS is ever switched off on `tenants` — as
-- opposed to merely un-FORCED — fail the migration rather than deploy an open
-- table.

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'tenants' AND relnamespace = 'public'::regnamespace AND relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'Row-level security is not enabled on "tenants". Un-FORCING is intended; disabling is not.';
  END IF;

  -- users and audit_logs must still be forced: nothing above should have
  -- touched them, and if something did, that is a much bigger problem.
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname IN ('users', 'audit_logs')
      AND relnamespace = 'public'::regnamespace
      AND NOT relforcerowsecurity
  ) THEN
    RAISE EXCEPTION
      'FORCE ROW LEVEL SECURITY is missing on "users" or "audit_logs"; tenant isolation would not survive running as the table owner.';
  END IF;
END
$guard$;
