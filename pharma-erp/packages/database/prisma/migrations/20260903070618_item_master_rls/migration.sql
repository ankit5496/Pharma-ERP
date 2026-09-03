-- =============================================================================
-- Row-Level Security, no-hard-delete trigger, and runtime grants for items
-- =============================================================================

ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "items_tenant_isolation" ON "items"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());

CREATE TRIGGER "items_no_hard_delete"
  BEFORE DELETE ON "items"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- Grant runtime privileges to the least-privilege app role.
-- Skipped silently if the role does not exist (e.g. CI with a single role).
DO $grants$
DECLARE
  v_role text := 'pharma_app';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    RAISE NOTICE 'Role % not present; skipping runtime grants.', v_role;
    RETURN;
  END IF;

  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "items" TO %I', v_role);
END
$grants$;
