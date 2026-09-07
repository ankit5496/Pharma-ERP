-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('SUPPLIER', 'CUSTOMER', 'BOTH', 'PRINCIPAL');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LicenceType" AS ENUM ('MANUFACTURING', 'GST', 'NARCOTICS', 'WHOLESALE_DRUG', 'IMPORT_EXPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "LicenceStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SURRENDERED');

-- CreateEnum
CREATE TYPE "JobWorkBillingModel" AS ENUM ('OWN_PROCUREMENT', 'PURE_CONVERSION');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BatchType" AS ENUM ('MANUFACTURED', 'PURCHASED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('IN_PROGRESS', 'QC_PENDING', 'RELEASED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GrnStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "PartyType" NOT NULL,
    "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "gstin" VARCHAR(15),
    "pan" VARCHAR(10),
    "address" VARCHAR(500),
    "contact_name" VARCHAR(255),
    "contact_phone" VARCHAR(32),
    "contact_email" VARCHAR(320),
    "supplier_drug_licence" VARCHAR(64),
    "payment_terms_days" INTEGER,
    "customer_drug_licence" VARCHAR(64),
    "customer_drug_licence_expiry" DATE,
    "credit_limit_amount" DECIMAL(12,2),
    "credit_period_days" INTEGER,
    "is_principal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_licences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "licence_type" "LicenceType" NOT NULL,
    "licence_number" VARCHAR(64) NOT NULL,
    "issuing_authority" VARCHAR(255) NOT NULL,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "status" "LicenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "alert_threshold_days" INTEGER NOT NULL DEFAULT 90,
    "document_url" VARCHAR(500),
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "compliance_licences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_work_agreements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "agreement_number" VARCHAR(64) NOT NULL,
    "billing_model" "JobWorkBillingModel" NOT NULL,
    "conversion_charge_rate" DECIMAL(12,2),
    "currency" VARCHAR(8) NOT NULL DEFAULT 'INR',
    "effective_date" DATE NOT NULL,
    "expiry_date" DATE,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "job_work_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_work_products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "job_work_agreement_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "brand_name" VARCHAR(255) NOT NULL,
    "conversion_charge_rate" DECIMAL(12,2),
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "job_work_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "batch_size" DECIMAL(12,3) NOT NULL,
    "batch_size_uom" VARCHAR(16) NOT NULL,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bom_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "overage_percent" DECIMAL(5,2),
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_requirements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "pack_size_variant" VARCHAR(64) NOT NULL,
    "units_per_pack" INTEGER NOT NULL,
    "packs_per_batch" INTEGER NOT NULL,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "packaging_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_requirement_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "packaging_requirement_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "component_type" VARCHAR(64) NOT NULL,
    "qty_per_pack" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "packaging_requirement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "po_number" VARCHAR(32) NOT NULL,
    "party_id" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL,
    "due_date" DATE,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "ordered_qty" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "grn_number" VARCHAR(32) NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "status" "GrnStatus" NOT NULL DEFAULT 'DRAFT',
    "received_date" DATE NOT NULL,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "grns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "purchase_order_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "received_qty" DECIMAL(12,3) NOT NULL,
    "accepted_qty" DECIMAL(12,3) NOT NULL,
    "rejected_qty" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "supplier_batch_number" VARCHAR(64),
    "manufacturing_date" DATE,
    "expiry_date" DATE,
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_number" VARCHAR(64) NOT NULL,
    "grn_id" UUID NOT NULL,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_invoice_id" UUID NOT NULL,
    "grn_line_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "purchase_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "wo_number" VARCHAR(32) NOT NULL,
    "bom_id" UUID NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "planned_date" DATE NOT NULL,
    "completed_date" DATE,
    "planned_qty" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "batch_number" VARCHAR(64) NOT NULL,
    "item_id" UUID NOT NULL,
    "type" "BatchType" NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "quantity" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "manufacturing_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "work_order_id" UUID,
    "grn_line_id" UUID,
    "released_at" TIMESTAMPTZ(6),
    "released_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" VARCHAR(500),
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "so_number" VARCHAR(32) NOT NULL,
    "party_id" UUID NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL,
    "due_date" DATE,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "ordered_qty" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "ceiling_price" DECIMAL(12,2),
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_number" VARCHAR(64) NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "remarks" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sales_invoice_id" UUID NOT NULL,
    "sales_order_line_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "uom" VARCHAR(16) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parties_tenant_id_type_idx" ON "parties"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "parties_tenant_id_status_idx" ON "parties"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "parties_tenant_id_deleted_at_idx" ON "parties"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "parties_tenant_id_code_key" ON "parties"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "compliance_licences_tenant_id_licence_type_idx" ON "compliance_licences"("tenant_id", "licence_type");

-- CreateIndex
CREATE INDEX "compliance_licences_tenant_id_status_idx" ON "compliance_licences"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "compliance_licences_tenant_id_expiry_date_idx" ON "compliance_licences"("tenant_id", "expiry_date");

-- CreateIndex
CREATE INDEX "compliance_licences_tenant_id_deleted_at_idx" ON "compliance_licences"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_licences_tenant_id_licence_type_licence_number_key" ON "compliance_licences"("tenant_id", "licence_type", "licence_number");

-- CreateIndex
CREATE INDEX "job_work_agreements_tenant_id_principal_id_idx" ON "job_work_agreements"("tenant_id", "principal_id");

-- CreateIndex
CREATE INDEX "job_work_agreements_tenant_id_deleted_at_idx" ON "job_work_agreements"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_work_agreements_tenant_id_agreement_number_key" ON "job_work_agreements"("tenant_id", "agreement_number");

-- CreateIndex
CREATE INDEX "job_work_products_tenant_id_job_work_agreement_id_idx" ON "job_work_products"("tenant_id", "job_work_agreement_id");

-- CreateIndex
CREATE INDEX "job_work_products_tenant_id_item_id_idx" ON "job_work_products"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "job_work_products_tenant_id_deleted_at_idx" ON "job_work_products"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_work_products_tenant_id_job_work_agreement_id_item_id_key" ON "job_work_products"("tenant_id", "job_work_agreement_id", "item_id");

-- CreateIndex
CREATE INDEX "boms_tenant_id_item_id_status_idx" ON "boms"("tenant_id", "item_id", "status");

-- CreateIndex
CREATE INDEX "boms_tenant_id_deleted_at_idx" ON "boms"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "boms_tenant_id_item_id_version_key" ON "boms"("tenant_id", "item_id", "version");

-- CreateIndex
CREATE INDEX "bom_lines_tenant_id_bom_id_idx" ON "bom_lines"("tenant_id", "bom_id");

-- CreateIndex
CREATE INDEX "bom_lines_tenant_id_deleted_at_idx" ON "bom_lines"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "bom_lines_tenant_id_bom_id_item_id_key" ON "bom_lines"("tenant_id", "bom_id", "item_id");

-- CreateIndex
CREATE INDEX "packaging_requirements_tenant_id_item_id_idx" ON "packaging_requirements"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "packaging_requirements_tenant_id_deleted_at_idx" ON "packaging_requirements"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_requirements_tenant_id_item_id_pack_size_variant_key" ON "packaging_requirements"("tenant_id", "item_id", "pack_size_variant");

-- CreateIndex
CREATE INDEX "packaging_requirement_lines_tenant_id_packaging_requirement_idx" ON "packaging_requirement_lines"("tenant_id", "packaging_requirement_id");

-- CreateIndex
CREATE INDEX "packaging_requirement_lines_tenant_id_deleted_at_idx" ON "packaging_requirement_lines"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_requirement_lines_tenant_id_packaging_requirement_key" ON "packaging_requirement_lines"("tenant_id", "packaging_requirement_id", "item_id");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_status_idx" ON "purchase_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_party_id_idx" ON "purchase_orders"("tenant_id", "party_id");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_deleted_at_idx" ON "purchase_orders"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_po_number_key" ON "purchase_orders"("tenant_id", "po_number");

-- CreateIndex
CREATE INDEX "purchase_order_lines_tenant_id_purchase_order_id_idx" ON "purchase_order_lines"("tenant_id", "purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_tenant_id_deleted_at_idx" ON "purchase_order_lines"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_tenant_id_purchase_order_id_line_numbe_key" ON "purchase_order_lines"("tenant_id", "purchase_order_id", "line_number");

-- CreateIndex
CREATE INDEX "grns_tenant_id_status_idx" ON "grns"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "grns_tenant_id_purchase_order_id_idx" ON "grns"("tenant_id", "purchase_order_id");

-- CreateIndex
CREATE INDEX "grns_tenant_id_deleted_at_idx" ON "grns"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grns_tenant_id_grn_number_key" ON "grns"("tenant_id", "grn_number");

-- CreateIndex
CREATE INDEX "grn_lines_tenant_id_grn_id_idx" ON "grn_lines"("tenant_id", "grn_id");

-- CreateIndex
CREATE INDEX "grn_lines_tenant_id_deleted_at_idx" ON "grn_lines"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "grn_lines_tenant_id_grn_id_line_number_key" ON "grn_lines"("tenant_id", "grn_id", "line_number");

-- CreateIndex
CREATE INDEX "purchase_invoices_tenant_id_status_idx" ON "purchase_invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "purchase_invoices_tenant_id_grn_id_idx" ON "purchase_invoices"("tenant_id", "grn_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_tenant_id_deleted_at_idx" ON "purchase_invoices"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_tenant_id_invoice_number_key" ON "purchase_invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_tenant_id_purchase_invoice_id_idx" ON "purchase_invoice_lines"("tenant_id", "purchase_invoice_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_tenant_id_deleted_at_idx" ON "purchase_invoice_lines"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_lines_tenant_id_purchase_invoice_id_line_n_key" ON "purchase_invoice_lines"("tenant_id", "purchase_invoice_id", "line_number");

-- CreateIndex
CREATE INDEX "work_orders_tenant_id_status_idx" ON "work_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "work_orders_tenant_id_bom_id_idx" ON "work_orders"("tenant_id", "bom_id");

-- CreateIndex
CREATE INDEX "work_orders_tenant_id_deleted_at_idx" ON "work_orders"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_tenant_id_wo_number_key" ON "work_orders"("tenant_id", "wo_number");

-- CreateIndex
CREATE UNIQUE INDEX "batches_grn_line_id_key" ON "batches"("grn_line_id");

-- CreateIndex
CREATE INDEX "batches_tenant_id_item_id_status_idx" ON "batches"("tenant_id", "item_id", "status");

-- CreateIndex
CREATE INDEX "batches_tenant_id_type_idx" ON "batches"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "batches_tenant_id_deleted_at_idx" ON "batches"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "batches_tenant_id_batch_number_key" ON "batches"("tenant_id", "batch_number");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_status_idx" ON "sales_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_party_id_idx" ON "sales_orders"("tenant_id", "party_id");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_deleted_at_idx" ON "sales_orders"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_tenant_id_so_number_key" ON "sales_orders"("tenant_id", "so_number");

-- CreateIndex
CREATE INDEX "sales_order_lines_tenant_id_sales_order_id_idx" ON "sales_order_lines"("tenant_id", "sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_lines_tenant_id_deleted_at_idx" ON "sales_order_lines"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_lines_tenant_id_sales_order_id_line_number_key" ON "sales_order_lines"("tenant_id", "sales_order_id", "line_number");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_status_idx" ON "sales_invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_sales_order_id_idx" ON "sales_invoices"("tenant_id", "sales_order_id");

-- CreateIndex
CREATE INDEX "sales_invoices_tenant_id_deleted_at_idx" ON "sales_invoices"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_tenant_id_invoice_number_key" ON "sales_invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_tenant_id_sales_invoice_id_idx" ON "sales_invoice_lines"("tenant_id", "sales_invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_tenant_id_deleted_at_idx" ON "sales_invoice_lines"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_lines_tenant_id_sales_invoice_id_line_number_key" ON "sales_invoice_lines"("tenant_id", "sales_invoice_id", "line_number");

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_licences" ADD CONSTRAINT "compliance_licences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_agreements" ADD CONSTRAINT "job_work_agreements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_agreements" ADD CONSTRAINT "job_work_agreements_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_products" ADD CONSTRAINT "job_work_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_products" ADD CONSTRAINT "job_work_products_job_work_agreement_id_fkey" FOREIGN KEY ("job_work_agreement_id") REFERENCES "job_work_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_products" ADD CONSTRAINT "job_work_products_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_requirements" ADD CONSTRAINT "packaging_requirements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_requirements" ADD CONSTRAINT "packaging_requirements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_requirement_lines" ADD CONSTRAINT "packaging_requirement_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_requirement_lines" ADD CONSTRAINT "packaging_requirement_lines_packaging_requirement_id_fkey" FOREIGN KEY ("packaging_requirement_id") REFERENCES "packaging_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_requirement_lines" ADD CONSTRAINT "packaging_requirement_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grns" ADD CONSTRAINT "grns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grns" ADD CONSTRAINT "grns_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_grn_line_id_fkey" FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_grn_line_id_fkey" FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_sales_order_line_id_fkey" FOREIGN KEY ("sales_order_line_id") REFERENCES "sales_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
