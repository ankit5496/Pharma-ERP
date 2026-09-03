-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('RAW_MATERIAL', 'PACKING_MATERIAL', 'SEMI_FINISHED', 'FINISHED_GOOD');

-- CreateEnum
CREATE TYPE "ScheduleClassification" AS ENUM ('NONE', 'H', 'H1', 'X', 'G');

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "brand_name" VARCHAR(255) NOT NULL,
    "generic_name" VARCHAR(255) NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "schedule_classification" "ScheduleClassification" NOT NULL DEFAULT 'NONE',
    "hsn_code" VARCHAR(8) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "mrp" DECIMAL(12,2),
    "is_dpco_controlled" BOOLEAN NOT NULL DEFAULT false,
    "storage_conditions" VARCHAR(500),
    "reorder_level" DECIMAL(12,3),
    "shelf_life_days" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "items_tenant_id_category_idx" ON "items"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "items_tenant_id_deleted_at_idx" ON "items"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "items_tenant_id_code_key" ON "items"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
