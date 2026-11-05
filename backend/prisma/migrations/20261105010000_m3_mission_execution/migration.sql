-- M3_TASK_014 Fase B: eksekusi misi oleh agent (penjadwal + batas run)
ALTER TABLE "agent_missions"
    ADD COLUMN "execution_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "max_runs" INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN "runs_dispatched" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "task_map" JSONB,
    ADD COLUMN "completed_at" TIMESTAMPTZ(6),
    ADD CONSTRAINT "agent_missions_max_runs_chk" CHECK ("max_runs" BETWEEN 0 AND 50);
