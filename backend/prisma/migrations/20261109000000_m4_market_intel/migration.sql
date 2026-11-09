-- DSH-V1-01: m4_market_intel (Marketing Intelligence v1.0.0) + kolom kontrak 1.3 di intel_jobs.
-- Bagian 1 dibangkitkan prisma migrate diff; bagian 2 (constraint/view) ditulis manual.

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "opportunity_status" AS ENUM ('new', 'qualified', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'dropped');

-- CreateEnum
CREATE TYPE "opportunity_priority" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "marketing_action_status" AS ENUM ('planned', 'in_progress', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "strategy_status" AS ENUM ('draft', 'in_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "content_platform" AS ENUM ('instagram', 'tiktok', 'linkedin', 'x', 'threads');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('draft', 'approved', 'rejected', 'scheduled', 'published');

-- CreateEnum
CREATE TYPE "approval_subject" AS ENUM ('product_analysis', 'keyword_set', 'strategy', 'content_batch', 'knowledge_card', 'doctrine', 'contact_batch', 'import_review', 'mission_plan');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('pending', 'approved', 'rejected', 'revise');

-- CreateEnum
CREATE TYPE "upload_kind" AS ENUM ('pdf', 'xlsx', 'csv');

-- CreateEnum
CREATE TYPE "upload_purpose" AS ENUM ('book', 'brand', 'import');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "intel_job_status" ADD VALUE 'running';
ALTER TYPE "intel_job_status" ADD VALUE 'awaiting_review';
ALTER TYPE "intel_job_status" ADD VALUE 'paused';

-- AlterTable
ALTER TABLE "intel_jobs" ADD COLUMN     "budget_usd" DOUBLE PRECISION,
ADD COLUMN     "kind" VARCHAR(32),
ADD COLUMN     "llm_assist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pause" JSONB,
ADD COLUMN     "result_summary" JSONB,
ADD COLUMN     "stage_view" JSONB;

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "category" VARCHAR(100),
    "description" TEXT,
    "value_proposition" TEXT,
    "target_notes" TEXT,
    "price_range" VARCHAR(100),
    "deal_value_estimate" DECIMAL(18,2),
    "status" "product_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "benefit" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "mcp_company_id" UUID NOT NULL,
    "company_name_cache" VARCHAR(300) NOT NULL,
    "latest_score" DECIMAL(5,2),
    "priority" "opportunity_priority",
    "score_model_version" VARCHAR(32),
    "status" "opportunity_status" NOT NULL DEFAULT 'new',
    "owner_user_id" UUID,
    "next_action_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "opportunity_id" UUID NOT NULL,
    "event_type" VARCHAR(32) NOT NULL,
    "from_status" "opportunity_status",
    "to_status" "opportunity_status",
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "opportunity_id" UUID,
    "strategy_doc_id" UUID,
    "content_item_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "channel" VARCHAR(48) NOT NULL,
    "status" "marketing_action_status" NOT NULL DEFAULT 'planned',
    "task_id" UUID,
    "result" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_docs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "intel_job_id" UUID,
    "mcp_report_id" VARCHAR(32),
    "title" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "strategy_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "strategy_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "strategy_doc_id" UUID NOT NULL,
    "mcp_batch_id" VARCHAR(32),
    "mcp_item_ref" VARCHAR(32),
    "platform" "content_platform" NOT NULL,
    "format" VARCHAR(32) NOT NULL,
    "pillar" VARCHAR(100) NOT NULL,
    "funnel_stage" VARCHAR(32) NOT NULL,
    "segment" VARCHAR(100),
    "hook" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "cta" VARCHAR(200) NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visual_brief" TEXT NOT NULL DEFAULT '',
    "framework_refs" JSONB NOT NULL DEFAULT '[]',
    "insight_refs" JSONB NOT NULL DEFAULT '[]',
    "eval_score" DOUBLE PRECISION,
    "eval_reason" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMPTZ(6),
    "published_url" TEXT,
    "task_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "edited_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "subject_type" "approval_subject" NOT NULL,
    "subject_ref" VARCHAR(64) NOT NULL,
    "intel_job_id" UUID,
    "mcp_review_id" VARCHAR(16),
    "summary" TEXT,
    "non_blocking" BOOLEAN NOT NULL DEFAULT false,
    "status" "approval_status" NOT NULL DEFAULT 'pending',
    "requested_by_agent" VARCHAR(100),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_refs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "kind" "upload_kind" NOT NULL,
    "mcp_upload_id" VARCHAR(16) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "size" BIGINT NOT NULL,
    "sha256" CHAR(64),
    "uploaded_by" UUID,
    "purpose" "upload_purpose" NOT NULL,
    "status_cache" VARCHAR(24) NOT NULL DEFAULT 'stored',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "page" VARCHAR(48) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_ws_status_idx" ON "products"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "product_features_product_idx" ON "product_features"("product_id", "order_index");

-- CreateIndex
CREATE INDEX "opportunities_ws_status_idx" ON "opportunities"("workspace_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_ws_product_company_key" ON "opportunities"("workspace_id", "product_id", "mcp_company_id");

-- CreateIndex
CREATE INDEX "opportunity_events_opp_idx" ON "opportunity_events"("opportunity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "marketing_actions_ws_idx" ON "marketing_actions"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "strategy_docs_ws_product_idx" ON "strategy_docs"("workspace_id", "product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_items_ws_status_idx" ON "content_items"("workspace_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "content_items_strategy_idx" ON "content_items"("strategy_doc_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_ws_item_ref_key" ON "content_items"("workspace_id", "mcp_item_ref");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_mcp_review_key" ON "approvals"("mcp_review_id");

-- CreateIndex
CREATE INDEX "approvals_ws_status_idx" ON "approvals"("workspace_id", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "upload_refs_mcp_upload_key" ON "upload_refs"("mcp_upload_id");

-- CreateIndex
CREATE INDEX "upload_refs_ws_idx" ON "upload_refs"("workspace_id", "purpose", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_owner_page_name_key" ON "saved_views"("workspace_id", "user_id", "page", "name");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_actions" ADD CONSTRAINT "marketing_actions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marketing_actions" ADD CONSTRAINT "marketing_actions_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marketing_actions" ADD CONSTRAINT "marketing_actions_strategy_doc_id_fkey" FOREIGN KEY ("strategy_doc_id") REFERENCES "strategy_docs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marketing_actions" ADD CONSTRAINT "marketing_actions_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marketing_actions" ADD CONSTRAINT "marketing_actions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marketing_actions" ADD CONSTRAINT "marketing_actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "strategy_docs" ADD CONSTRAINT "strategy_docs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "strategy_docs" ADD CONSTRAINT "strategy_docs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "strategy_docs" ADD CONSTRAINT "strategy_docs_intel_job_id_fkey" FOREIGN KEY ("intel_job_id") REFERENCES "intel_jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "strategy_docs" ADD CONSTRAINT "strategy_docs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_strategy_doc_id_fkey" FOREIGN KEY ("strategy_doc_id") REFERENCES "strategy_docs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_intel_job_id_fkey" FOREIGN KEY ("intel_job_id") REFERENCES "intel_jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "upload_refs" ADD CONSTRAINT "upload_refs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "upload_refs" ADD CONSTRAINT "upload_refs_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =====================================================================
-- Bagian 2 (manual): aturan yang tidak bisa diekspresikan Prisma
-- =====================================================================

-- Slug unik per workspace hanya untuk produk yang belum dihapus
CREATE UNIQUE INDEX "products_ws_slug_key" ON "products"("workspace_id", "slug") WHERE "deleted_at" IS NULL;

ALTER TABLE "products"
  ADD CONSTRAINT "products_slug_format_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "products_deal_value_chk" CHECK ("deal_value_estimate" IS NULL OR "deal_value_estimate" >= 0);

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_score_chk" CHECK ("latest_score" IS NULL OR ("latest_score" >= 0 AND "latest_score" <= 100));

ALTER TABLE "opportunity_events"
  ADD CONSTRAINT "opportunity_events_type_chk" CHECK ("event_type" IN ('created', 'status_changed', 'note', 'score_updated', 'action', 'owner_changed'));

ALTER TABLE "strategy_docs"
  ADD CONSTRAINT "strategy_docs_version_chk" CHECK ("version" >= 1);

ALTER TABLE "content_items"
  ADD CONSTRAINT "content_items_version_chk" CHECK ("version" >= 1),
  ADD CONSTRAINT "content_items_eval_score_chk" CHECK ("eval_score" IS NULL OR ("eval_score" >= 0 AND "eval_score" <= 1)),
  ADD CONSTRAINT "content_items_funnel_chk" CHECK ("funnel_stage" IN ('awareness', 'consideration', 'conversion', 'retention')),
  ADD CONSTRAINT "content_items_scheduled_chk" CHECK ("status" <> 'scheduled' OR "scheduled_at" IS NOT NULL),
  ADD CONSTRAINT "content_items_published_chk" CHECK ("status" <> 'published' OR "published_url" IS NOT NULL);

ALTER TABLE "approvals"
  ADD CONSTRAINT "approvals_decision_chk" CHECK (("status" = 'pending') = ("decided_at" IS NULL));

-- Upload: PDF ≤ 100 MB (buku/brand), XLSX/CSV ≤ 20 MB (import) — V1-K9
ALTER TABLE "upload_refs"
  ADD CONSTRAINT "upload_refs_size_chk" CHECK (
    "size" > 0 AND (("kind" = 'pdf' AND "size" <= 104857600) OR ("kind" IN ('xlsx', 'csv') AND "size" <= 20971520))
  ),
  ADD CONSTRAINT "upload_refs_purpose_chk" CHECK (
    ("purpose" IN ('book', 'brand') AND "kind" = 'pdf') OR ("purpose" = 'import' AND "kind" IN ('xlsx', 'csv'))
  );

-- Job sosial Modul 3 (kind NULL) tetap wajib 1–4 sumber; job kind 1.3 tidak memakai kolom sources
ALTER TABLE "intel_jobs" DROP CONSTRAINT "intel_jobs_sources_count_check";
ALTER TABLE "intel_jobs" ADD CONSTRAINT "intel_jobs_sources_count_check" CHECK (
  ("kind" IS NULL AND cardinality("sources") BETWEEN 1 AND 4) OR ("kind" IS NOT NULL AND cardinality("sources") = 0)
);

ALTER TABLE "intel_jobs"
  ADD CONSTRAINT "intel_jobs_kind_chk" CHECK (
    "kind" IS NULL OR "kind" IN ('company_discovery', 'company_import', 'contact_finder', 'social_listening',
                                 'book_ingest', 'opportunity_scoring', 'strategy', 'content_bank')
  ),
  ADD CONSTRAINT "intel_jobs_budget_chk" CHECK ("budget_usd" IS NULL OR ("budget_usd" >= 0 AND "budget_usd" <= 100));

-- Read model untuk MCP (V1-K3: "MCP membaca public.products lewat read model").
-- Hanya produk aktif/draft yang belum dihapus, fitur sebagai JSON terurut. Tanpa data pengguna.
CREATE VIEW "mcp_products_v" AS
SELECT
  p."id",
  p."workspace_id",
  p."name",
  p."slug",
  p."category",
  p."description",
  p."value_proposition",
  p."target_notes",
  p."price_range",
  p."deal_value_estimate",
  p."status",
  p."updated_at",
  COALESCE(
    jsonb_agg(
      jsonb_build_object('id', f."id", 'name', f."name", 'description', f."description", 'benefit', f."benefit", 'order_index', f."order_index")
      ORDER BY f."order_index", f."name"
    ) FILTER (WHERE f."id" IS NOT NULL),
    '[]'::jsonb
  ) AS "features"
FROM "products" p
LEFT JOIN "product_features" f ON f."product_id" = p."id"
WHERE p."deleted_at" IS NULL AND p."status" <> 'archived'
GROUP BY p."id";

-- Role baca MCP bersifat opsional (dibuat admin DB: CREATE ROLE mcp_reader LOGIN PASSWORD '...').
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_reader') THEN
    GRANT USAGE ON SCHEMA public TO mcp_reader;
    GRANT SELECT ON "mcp_products_v" TO mcp_reader;
  END IF;
END
$$;
