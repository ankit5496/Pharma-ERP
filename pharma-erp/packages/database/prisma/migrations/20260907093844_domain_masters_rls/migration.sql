-- =============================================================================
-- RLS, no-hard-delete triggers, partial unique index for BOMs,
-- and runtime grants for all domain master tables
-- =============================================================================

-- parties
ALTER TABLE "parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties" FORCE ROW LEVEL SECURITY;
CREATE POLICY "parties_tenant_isolation" ON "parties"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "parties_no_hard_delete"
  BEFORE DELETE ON "parties"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- compliance_licences
ALTER TABLE "compliance_licences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_licences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "compliance_licences_tenant_isolation" ON "compliance_licences"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "compliance_licences_no_hard_delete"
  BEFORE DELETE ON "compliance_licences"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- job_work_agreements
ALTER TABLE "job_work_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_work_agreements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "job_work_agreements_tenant_isolation" ON "job_work_agreements"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "job_work_agreements_no_hard_delete"
  BEFORE DELETE ON "job_work_agreements"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- job_work_products
ALTER TABLE "job_work_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_work_products" FORCE ROW LEVEL SECURITY;
CREATE POLICY "job_work_products_tenant_isolation" ON "job_work_products"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "job_work_products_no_hard_delete"
  BEFORE DELETE ON "job_work_products"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- boms
ALTER TABLE "boms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boms" FORCE ROW LEVEL SECURITY;
CREATE POLICY "boms_tenant_isolation" ON "boms"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "boms_no_hard_delete"
  BEFORE DELETE ON "boms"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();
-- Only one ACTIVE BOM per item per tenant (Prisma cannot express partial indexes)
CREATE UNIQUE INDEX "boms_one_active_per_item"
  ON "boms" ("tenant_id", "item_id")
  WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL;

-- bom_lines
ALTER TABLE "bom_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bom_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bom_lines_tenant_isolation" ON "bom_lines"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "bom_lines_no_hard_delete"
  BEFORE DELETE ON "bom_lines"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- packaging_requirements
ALTER TABLE "packaging_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "packaging_requirements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "packaging_requirements_tenant_isolation" ON "packaging_requirements"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "packaging_requirements_no_hard_delete"
  BEFORE DELETE ON "packaging_requirements"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- packaging_requirement_lines
ALTER TABLE "packaging_requirement_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "packaging_requirement_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "packaging_requirement_lines_tenant_isolation" ON "packaging_requirement_lines"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "packaging_requirement_lines_no_hard_delete"
  BEFORE DELETE ON "packaging_requirement_lines"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- purchase_orders
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_orders_tenant_isolation" ON "purchase_orders"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "purchase_orders_no_hard_delete"
  BEFORE DELETE ON "purchase_orders"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- purchase_order_lines
ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_order_lines_tenant_isolation" ON "purchase_order_lines"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "purchase_order_lines_no_hard_delete"
  BEFORE DELETE ON "purchase_order_lines"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- grns
ALTER TABLE "grns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "grns_tenant_isolation" ON "grns"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "grns_no_hard_delete"
  BEFORE DELETE ON "grns"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- grn_lines
ALTER TABLE "grn_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grn_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "grn_lines_tenant_isolation" ON "grn_lines"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "grn_lines_no_hard_delete"
  BEFORE DELETE ON "grn_lines"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- purchase_invoices
ALTER TABLE "purchase_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_invoices_tenant_isolation" ON "purchase_invoices"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "purchase_invoices_no_hard_delete"
  BEFORE DELETE ON "purchase_invoices"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- purchase_invoice_lines
ALTER TABLE "purchase_invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_invoice_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "purchase_invoice_lines_tenant_isolation" ON "purchase_invoice_lines"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "purchase_invoice_lines_no_hard_delete"
  BEFORE DELETE ON "purchase_invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- work_orders
ALTER TABLE "work_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "work_orders_tenant_isolation" ON "work_orders"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "work_orders_no_hard_delete"
  BEFORE DELETE ON "work_orders"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- batches
ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "batches_tenant_isolation" ON "batches"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "batches_no_hard_delete"
  BEFORE DELETE ON "batches"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- sales_orders
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sales_orders_tenant_isolation" ON "sales_orders"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "sales_orders_no_hard_delete"
  BEFORE DELETE ON "sales_orders"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- sales_order_lines
ALTER TABLE "sales_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_order_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sales_order_lines_tenant_isolation" ON "sales_order_lines"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "sales_order_lines_no_hard_delete"
  BEFORE DELETE ON "sales_order_lines"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- sales_invoices
ALTER TABLE "sales_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sales_invoices_tenant_isolation" ON "sales_invoices"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "sales_invoices_no_hard_delete"
  BEFORE DELETE ON "sales_invoices"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- sales_invoice_lines
ALTER TABLE "sales_invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_invoice_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sales_invoice_lines_tenant_isolation" ON "sales_invoice_lines"
  FOR ALL
  USING ("tenant_id" = public.current_tenant_id())
  WITH CHECK ("tenant_id" = public.require_tenant_id());
CREATE TRIGGER "sales_invoice_lines_no_hard_delete"
  BEFORE DELETE ON "sales_invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

-- Runtime grants for pharma_app
DO $grants$
DECLARE
  v_role text := 'pharma_app';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    RAISE NOTICE 'Role % not present; skipping runtime grants.', v_role;
    RETURN;
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "parties" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "compliance_licences" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "job_work_agreements" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "job_work_products" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "boms" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "bom_lines" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "packaging_requirements" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "packaging_requirement_lines" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "purchase_orders" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "purchase_order_lines" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "grns" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "grn_lines" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "purchase_invoices" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "purchase_invoice_lines" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "work_orders" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "batches" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "sales_orders" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "sales_order_lines" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "sales_invoices" TO %I', v_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE "sales_invoice_lines" TO %I', v_role);
END
$grants$;