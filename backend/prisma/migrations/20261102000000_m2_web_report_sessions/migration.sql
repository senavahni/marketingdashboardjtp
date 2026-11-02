-- Modul 2: Laporan Performa Website (M2_TASK_001). Bagian 1 dihasilkan oleh `prisma migrate diff`, bagian 2 ditulis manual.

-- ===== Bagian 1: hasil Prisma =====

-- CreateEnum
CREATE TYPE "web_report_period_type" AS ENUM ('monthly', 'quarterly', 'yearly', 'custom');

-- CreateTable
CREATE TABLE "web_report_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "period_type" "web_report_period_type" NOT NULL DEFAULT 'monthly',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "visitors" INTEGER NOT NULL,
    "leads" INTEGER NOT NULL,
    "sales_count" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,
    "cost_maintenance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cost_ads" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "results" JSONB NOT NULL,
    "formula_version" SMALLINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "web_report_sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "web_report_sessions" ADD CONSTRAINT "web_report_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "web_report_sessions" ADD CONSTRAINT "web_report_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "web_report_sessions" ADD CONSTRAINT "web_report_sessions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ===== Bagian 2: manual =====

ALTER TABLE web_report_sessions ADD CONSTRAINT wrs_counts_non_negative CHECK (visitors >= 0 AND leads >= 0 AND sales_count >= 0);
ALTER TABLE web_report_sessions ADD CONSTRAINT wrs_funnel_order CHECK (leads <= visitors AND sales_count <= leads);
ALTER TABLE web_report_sessions ADD CONSTRAINT wrs_money_non_negative CHECK (revenue >= 0 AND cost_maintenance >= 0 AND cost_ads >= 0);
ALTER TABLE web_report_sessions ADD CONSTRAINT wrs_period_range CHECK (period_end >= period_start);

CREATE INDEX wrs_workspace_period_idx ON web_report_sessions (workspace_id, period_start DESC, created_at DESC) WHERE deleted_at IS NULL;
