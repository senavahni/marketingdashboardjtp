-- M3_TASK_014: budget USD per misi (biaya run agent dari MCP) + penjadwalan ulang harian
ALTER TABLE "agent_missions"
    ADD COLUMN "budget_usd" DOUBLE PRECISION,
    ADD COLUMN "runs_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "last_reschedule_on" DATE,
    ADD CONSTRAINT "agent_missions_budget_chk" CHECK ("budget_usd" IS NULL OR ("budget_usd" > 0 AND "budget_usd" <= 100));
