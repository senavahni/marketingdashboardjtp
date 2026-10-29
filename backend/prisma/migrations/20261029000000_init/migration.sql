-- Modul 1 initial schema. Bagian 1 dihasilkan oleh `prisma migrate diff`, bagian 2 ditulis manual.

-- ===== Bagian 0: extensions =====
CREATE EXTENSION IF NOT EXISTS citext;

-- ===== Bagian 1: hasil Prisma =====

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "workspace_role" AS ENUM ('owner', 'admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('todo', 'in_progress', 'in_review', 'done');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('none', 'low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('user', 'agent', 'system');

-- CreateEnum
CREATE TYPE "agent_work_status" AS ENUM ('idle', 'queued', 'thinking', 'working', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "agent_run_trigger" AS ENUM ('assignment', 'mention', 'prompt_block');

-- CreateEnum
CREATE TYPE "agent_run_status" AS ENUM ('queued', 'dispatched', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('workspace', 'project', 'task', 'block', 'comment', 'agent', 'member');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "username" CITEXT NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by" UUID,
    "user_agent" TEXT,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "owner_id" UUID NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "workspace_role" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "handle" CITEXT NOT NULL,
    "mcp_agent_key" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(16),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "parent_task_id" UUID,
    "depth" SMALLINT NOT NULL DEFAULT 1,
    "title" VARCHAR(500) NOT NULL,
    "status" "task_status" NOT NULL DEFAULT 'todo',
    "priority" "task_priority" NOT NULL DEFAULT 'none',
    "assignee_type" "actor_type",
    "assignee_user_id" UUID,
    "assignee_agent_id" UUID,
    "start_date" DATE,
    "end_date" DATE,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "agent_status" "agent_work_status" NOT NULL DEFAULT 'idle',
    "created_by_type" "actor_type" NOT NULL DEFAULT 'user',
    "created_by_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_blocks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "parent_block_id" UUID,
    "block_type" VARCHAR(32) NOT NULL,
    "content_json" JSONB NOT NULL DEFAULT '{}',
    "plain_text" TEXT NOT NULL DEFAULT '',
    "order_index" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_edited_by_type" "actor_type" NOT NULL DEFAULT 'user',
    "last_edited_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "document_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "entity_type" "entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "author_type" "actor_type" NOT NULL,
    "author_user_id" UUID,
    "author_agent_id" UUID,
    "content" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "edited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "entity_type" "entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" VARCHAR(48) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "project_id" UUID,
    "entity_type" "entity_type",
    "entity_id" UUID,
    "actor_type" "actor_type",
    "actor_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "agent_id" UUID NOT NULL,
    "trigger" "agent_run_trigger" NOT NULL,
    "trigger_ref_id" UUID,
    "status" "agent_run_status" NOT NULL DEFAULT 'queued',
    "mcp_run_id" VARCHAR(200),
    "dispatched_by" UUID,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_error" JSONB,
    "last_event_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_webhook_events" (
    "event_id" UUID NOT NULL,
    "run_id" UUID,
    "event_type" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'processing',
    "error" JSONB,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "mcp_webhook_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "workspace_members_user_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE INDEX "tasks_project_idx" ON "tasks"("project_id", "status", "order_index");

-- CreateIndex
CREATE INDEX "tasks_parent_idx" ON "tasks"("parent_task_id");

-- CreateIndex
CREATE INDEX "tasks_timeline_idx" ON "tasks"("project_id", "start_date");

-- CreateIndex
CREATE INDEX "tasks_assignee_user_idx" ON "tasks"("assignee_user_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_agent_idx" ON "tasks"("assignee_agent_id");

-- CreateIndex
CREATE INDEX "tasks_tags_idx" ON "tasks" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "activity_project_idx" ON "activity_logs"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_entity_idx" ON "activity_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_idx" ON "notifications"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "refresh_tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_agent_id_fkey" FOREIGN KEY ("assignee_agent_id") REFERENCES "agents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_parent_block_id_fkey" FOREIGN KEY ("parent_block_id") REFERENCES "document_blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_agent_id_fkey" FOREIGN KEY ("author_agent_id") REFERENCES "agents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mcp_webhook_events" ADD CONSTRAINT "mcp_webhook_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- ===== Bagian 2: SQL manual (tidak dapat diekspresikan di schema.prisma) =====

-- users
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,32}$');

-- workspace: tepat satu owner
CREATE UNIQUE INDEX workspace_one_owner ON workspace_members (workspace_id) WHERE role = 'owner';

-- agents
ALTER TABLE agents ADD CONSTRAINT agents_handle_format CHECK (handle ~ '^[A-Za-z0-9_]{3,32}$');
CREATE UNIQUE INDEX agents_handle_uq ON agents (workspace_id, handle)        WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX agents_key_uq    ON agents (workspace_id, mcp_agent_key) WHERE deleted_at IS NULL;

-- projects
CREATE INDEX projects_workspace_idx ON projects (workspace_id) WHERE deleted_at IS NULL;

-- tasks
ALTER TABLE tasks ADD CONSTRAINT tasks_depth_range CHECK (depth BETWEEN 1 AND 3);
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_type_valid CHECK (assignee_type IS NULL OR assignee_type IN ('user','agent'));
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_consistent CHECK (
       (assignee_type IS NULL    AND assignee_user_id IS NULL     AND assignee_agent_id IS NULL)
    OR (assignee_type = 'user'   AND assignee_user_id IS NOT NULL AND assignee_agent_id IS NULL)
    OR (assignee_type = 'agent'  AND assignee_agent_id IS NOT NULL AND assignee_user_id IS NULL));
ALTER TABLE tasks ADD CONSTRAINT tasks_date_range CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
ALTER TABLE tasks ADD CONSTRAINT tasks_milestone CHECK (NOT is_milestone OR (start_date IS NOT NULL AND end_date = start_date));
ALTER TABLE tasks ADD CONSTRAINT tasks_not_own_parent CHECK (parent_task_id IS NULL OR parent_task_id <> id);
ALTER TABLE tasks ADD CONSTRAINT tasks_tags_limit CHECK (cardinality(tags) <= 20);

-- document_blocks
ALTER TABLE document_blocks ADD CONSTRAINT blocks_size CHECK (pg_column_size(content_json) <= 65536);
ALTER TABLE document_blocks ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', plain_text)) STORED;
CREATE INDEX blocks_task_tree_idx     ON document_blocks (task_id, parent_block_id, order_index) WHERE deleted_at IS NULL;
CREATE INDEX blocks_project_brief_idx ON document_blocks (project_id, parent_block_id, order_index) WHERE task_id IS NULL AND deleted_at IS NULL;
CREATE INDEX blocks_search_idx        ON document_blocks USING gin (search_vector);

-- comments
ALTER TABLE comments ADD CONSTRAINT comments_entity_type_valid CHECK (entity_type IN ('project','task','block'));
ALTER TABLE comments ADD CONSTRAINT comments_content_length CHECK (char_length(content) BETWEEN 1 AND 10000);
CREATE INDEX comments_entity_idx ON comments (entity_type, entity_id, created_at) WHERE deleted_at IS NULL;

-- notifications
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- agent_runs
CREATE UNIQUE INDEX agent_runs_one_active_assignment ON agent_runs (task_id)
  WHERE trigger = 'assignment' AND status IN ('queued','dispatched','running');
CREATE INDEX agent_runs_active_idx ON agent_runs (status, last_event_at) WHERE status IN ('queued','dispatched','running');
