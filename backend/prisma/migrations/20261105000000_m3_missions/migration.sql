-- M3_TASK_013/014: misi agent (rencana task + subtask di Penjadwalan)
CREATE TYPE "mission_source" AS ENUM ('intel_job', 'manual');
CREATE TYPE "mission_approval" AS ENUM ('auto', 'review');
CREATE TYPE "mission_status" AS ENUM ('waiting_research', 'planning', 'awaiting_review', 'scheduled', 'running', 'paused', 'completed', 'failed', 'cancelled');

CREATE TABLE "agent_missions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "source" "mission_source" NOT NULL,
    "intel_job_id" UUID,
    "title" VARCHAR(150) NOT NULL,
    "instruction" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "approval_mode" "mission_approval" NOT NULL DEFAULT 'auto',
    "status" "mission_status" NOT NULL DEFAULT 'planning',
    "plan" JSONB,
    "plan_revision" INTEGER NOT NULL DEFAULT 0,
    "materialized_revision" INTEGER,
    "feedback" TEXT,
    "error" JSONB,
    "root_task_id" UUID,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "planning_started_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "agent_missions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_missions_period_chk" CHECK ("end_date" >= "start_date")
);

CREATE UNIQUE INDEX "agent_missions_intel_job_key" ON "agent_missions"("intel_job_id");
CREATE UNIQUE INDEX "agent_missions_root_task_key" ON "agent_missions"("root_task_id");
CREATE INDEX "agent_missions_ws_idx" ON "agent_missions"("workspace_id", "created_at" DESC);
CREATE INDEX "agent_missions_status_idx" ON "agent_missions"("status", "updated_at");

ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_intel_job_id_fkey"
    FOREIGN KEY ("intel_job_id") REFERENCES "intel_jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_root_task_id_fkey"
    FOREIGN KEY ("root_task_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
