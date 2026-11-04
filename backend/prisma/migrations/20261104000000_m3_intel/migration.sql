CREATE TYPE "intel_job_status" AS ENUM ('queued', 'collecting', 'analyzing', 'indexing', 'completed', 'failed', 'cancelling', 'cancelled');
CREATE TYPE "intel_stage" AS ENUM ('collect', 'analyze', 'index');
CREATE TYPE "intel_stage_status" AS ENUM ('pending', 'running', 'completed', 'skipped', 'failed', 'cancelled');

CREATE TABLE "intel_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "status" "intel_job_status" NOT NULL DEFAULT 'queued',
    "spec" JSONB NOT NULL,
    "sources" TEXT[] NOT NULL,
    "confirm_cost" BOOLEAN NOT NULL DEFAULT false,
    "requested_by_name" VARCHAR(100) NOT NULL DEFAULT '',
    "estimate" JSONB,
    "mcp_job_id" VARCHAR(32),
    "last_event_sequence" INTEGER NOT NULL DEFAULT 0,
    "total_items" INTEGER,
    "items_handle" VARCHAR(32),
    "items_expire_at" TIMESTAMPTZ(6),
    "cost" JSONB,
    "error" JSONB,
    "retry_of_job_id" UUID,
    "created_by" UUID,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "insight_pending" BOOLEAN NOT NULL DEFAULT false,
    "terminal_notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "intel_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intel_job_stages" (
    "job_id" UUID NOT NULL,
    "stage" "intel_stage" NOT NULL,
    "agent_id" UUID NOT NULL,
    "agent_key" VARCHAR(100) NOT NULL,
    "status" "intel_stage_status" NOT NULL DEFAULT 'pending',
    "progress_done" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER,
    "stats" JSONB,
    "error" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    CONSTRAINT "intel_job_stages_pkey" PRIMARY KEY ("job_id", "stage")
);

CREATE TABLE "intel_insights" (
    "job_id" UUID NOT NULL,
    "summary_md" TEXT,
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "sentiment" JSONB,
    "trends" JSONB,
    "volume_by_day" JSONB,
    "google_trends" JSONB,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "intel_insights_pkey" PRIMARY KEY ("job_id")
);

CREATE TABLE "intel_stage_defaults" (
    "workspace_id" UUID NOT NULL,
    "stage" "intel_stage" NOT NULL,
    "agent_id" UUID NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "intel_stage_defaults_pkey" PRIMARY KEY ("workspace_id", "stage")
);

ALTER TABLE "mcp_webhook_events" ADD COLUMN "job_id" UUID;

ALTER TABLE "intel_jobs" ADD CONSTRAINT "intel_jobs_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "intel_jobs" ADD CONSTRAINT "intel_jobs_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "intel_jobs" ADD CONSTRAINT "intel_jobs_retry_of_job_id_fkey"
    FOREIGN KEY ("retry_of_job_id") REFERENCES "intel_jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "intel_job_stages" ADD CONSTRAINT "intel_job_stages_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "intel_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intel_job_stages" ADD CONSTRAINT "intel_job_stages_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "intel_insights" ADD CONSTRAINT "intel_insights_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "intel_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intel_stage_defaults" ADD CONSTRAINT "intel_stage_defaults_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intel_stage_defaults" ADD CONSTRAINT "intel_stage_defaults_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "intel_stage_defaults" ADD CONSTRAINT "intel_stage_defaults_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "mcp_webhook_events" ADD CONSTRAINT "mcp_webhook_events_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "intel_jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "intel_jobs_mcp_job_id_key" ON "intel_jobs"("mcp_job_id");
CREATE INDEX "intel_jobs_ws_idx" ON "intel_jobs"("workspace_id", "created_at" DESC) WHERE "deleted_at" IS NULL;
CREATE INDEX "intel_jobs_active_idx" ON "intel_jobs"("status", "updated_at")
    WHERE "status" IN ('queued', 'collecting', 'analyzing', 'indexing', 'cancelling');
CREATE INDEX "intel_jobs_insight_pending_idx" ON "intel_jobs"("updated_at") WHERE "insight_pending" = true;

ALTER TABLE "intel_jobs" ADD CONSTRAINT "intel_jobs_sources_count_check"
    CHECK (cardinality("sources") BETWEEN 1 AND 4);
ALTER TABLE "intel_jobs" ADD CONSTRAINT "intel_jobs_event_sequence_check"
    CHECK ("last_event_sequence" >= 0);
ALTER TABLE "intel_job_stages" ADD CONSTRAINT "intel_job_stages_progress_check"
    CHECK ("progress_done" >= 0 AND ("progress_total" IS NULL OR "progress_total" >= 0));
