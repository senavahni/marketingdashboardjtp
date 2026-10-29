# Task: Infrastructure, Security & Database Setup
**ID:** M1_TASK_001
**Status:** To Do
**Dependencies:** — (task pertama)
**Estimasi:** 5 person-days (Backend)
**Acuan:** [M1_ARCHITECTURE.md](M1_ARCHITECTURE.md)

## Objective
Mempersiapkan fondasi monorepo, database, autentikasi, dan keamanan dasar untuk Modul 1, sehingga task backend & frontend lain bisa langsung dibangun di atasnya.

## A. Setup Proyek
- [ ] Inisialisasi monorepo pnpm sesuai struktur [ARCHITECTURE §3](M1_ARCHITECTURE.md#3-struktur-repository-monorepo): `apps/api`, `apps/web`, `apps/mock-mcp`, `packages/shared`.
- [ ] Spike versi (README D1): NestJS + TypeScript versi target + Prisma + Vite build & test berjalan. Catat versi final di `package.json` (pinned).
- [ ] ESLint + Prettier + `tsconfig` strict di semua package; Husky + lint-staged untuk pre-commit.
- [ ] `docker-compose.yml` (postgres, redis; profile `full` untuk api/web/mock-mcp).
- [ ] Modul konfigurasi: validasi env dengan Zod, gagal start jika tidak valid. `.env.example` untuk setiap app.
- [ ] Global: `ValidationPipe` (nestjs-zod), exception filter → format error standar, interceptor `X-Request-Id`, logger pino, Helmet, CORS (`APP_URL`), `@nestjs/swagger` di `/api/docs` (nonaktif di produksi atau dilindungi basic auth), `/health` (cek DB & Redis).
- [ ] CI awal (GitHub Actions): install → lint → typecheck → test (detail lengkap di TASK_008).

## B. Database Schema (PostgreSQL)
Implementasi via `prisma/schema.prisma` + migrasi. Fitur yang tidak didukung Prisma secara native (CHECK constraint, partial index, generated column `tsvector`, `citext`) ditambahkan dengan SQL manual di file migrasi. **Nama field Prisma = nama kolom snake_case** (tanpa `@map`) agar konsisten dengan API.

### Checklist tabel
- [ ] Buat tabel `users` (id, email, username, display_name, password_hash, avatar_url, is_active, ...). *(Kolom `permission` dari versi awal diganti `workspace_members.role`.)*
- [ ] Buat tabel `refresh_tokens` (rotasi & deteksi reuse).
- [ ] Buat tabel `workspaces` (id, name, owner_id, timezone, ...).
- [ ] Buat tabel `workspace_members` (workspace_id, user_id, role) — dasar RBAC.
- [ ] Buat tabel `agents` (registry agent per workspace).
- [ ] Buat tabel `projects` (id, workspace_id, title, description, created_at, ...).
- [ ] Buat tabel `tasks` (id, project_id, parent_task_id [untuk subtask], depth, title, status, priority, assignee, start_date, end_date, is_milestone, tags, created_at, updated_at, ...).
- [ ] Buat tabel `document_blocks` (id, task_id / project_id, parent_block_id, block_type, content_json, order_index, version, created_at, updated_at, ...).
- [ ] Buat tabel `comments` (id, entity_id, entity_type, author, content, mentions, created_at, updated_at, ...).
- [ ] Buat tabel `activity_logs` (id, entity_id, entity_type, action, actor, metadata_json, created_at) — append-only.
- [ ] Buat tabel `notifications` (id, user_id, type, title, body, read_at, created_at, ...).
- [ ] Buat tabel `agent_runs` dan `mcp_webhook_events`.
- [ ] Seed data demo (lihat §B.3).

### B.1 DDL Referensi
DDL berikut adalah **sumber kebenaran** struktur data. Prisma schema harus menghasilkan struktur yang setara.

```sql
CREATE EXTENSION IF NOT EXISTS citext;

-- ===== Enums =====
CREATE TYPE workspace_role    AS ENUM ('owner','admin','member','viewer');
CREATE TYPE task_status       AS ENUM ('todo','in_progress','in_review','done');
CREATE TYPE task_priority     AS ENUM ('none','low','medium','high','urgent');
CREATE TYPE actor_type        AS ENUM ('user','agent','system');
CREATE TYPE agent_work_status AS ENUM ('idle','queued','thinking','working','completed','failed');
CREATE TYPE agent_run_trigger AS ENUM ('assignment','mention','prompt_block');
CREATE TYPE agent_run_status  AS ENUM ('queued','dispatched','running','completed','failed','cancelled');
CREATE TYPE entity_type       AS ENUM ('workspace','project','task','block','comment','agent','member');

-- ===== Users & Auth =====
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  username       citext NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_]{3,32}$'),
  display_name   varchar(100) NOT NULL,
  password_hash  text NOT NULL,                       -- argon2id
  avatar_url     text,
  is_active      boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL,                         -- satu family per sesi login
  token_hash   text NOT NULL UNIQUE,                  -- SHA-256 dari token opaque
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES refresh_tokens(id),
  user_agent   text,
  ip_address   inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx   ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- ===== Workspace & Membership =====
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(100) NOT NULL,
  owner_id    uuid NOT NULL REFERENCES users(id),
  timezone    varchar(64) NOT NULL DEFAULT 'Asia/Jakarta',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         workspace_role NOT NULL DEFAULT 'member',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members (user_id);
CREATE UNIQUE INDEX workspace_one_owner ON workspace_members (workspace_id) WHERE role = 'owner';

-- ===== Agents =====
CREATE TABLE agents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           varchar(100) NOT NULL,                -- "Agent_Strategist"
  handle         citext NOT NULL CHECK (handle ~ '^[A-Za-z0-9_]{3,32}$'),  -- untuk @mention
  mcp_agent_key  varchar(100) NOT NULL,                -- "strategist" (nama di MCP Server)
  description    text,
  avatar_url     text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE UNIQUE INDEX agents_handle_uq ON agents (workspace_id, handle)        WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX agents_key_uq    ON agents (workspace_id, mcp_agent_key) WHERE deleted_at IS NULL;

-- ===== Projects =====
CREATE TABLE projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  title         varchar(200) NOT NULL,
  description   text,
  icon          varchar(16),                           -- emoji
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX projects_workspace_idx ON projects (workspace_id) WHERE deleted_at IS NULL;

-- ===== Tasks =====
CREATE TABLE tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id),
  parent_task_id     uuid REFERENCES tasks(id),
  depth              smallint NOT NULL DEFAULT 1 CHECK (depth BETWEEN 1 AND 3),
  title              varchar(500) NOT NULL,
  status             task_status NOT NULL DEFAULT 'todo',
  priority           task_priority NOT NULL DEFAULT 'none',
  assignee_type      actor_type CHECK (assignee_type IN ('user','agent')),
  assignee_user_id   uuid REFERENCES users(id),
  assignee_agent_id  uuid REFERENCES agents(id),
  start_date         date,
  end_date           date,
  is_milestone       boolean NOT NULL DEFAULT false,
  tags               text[] NOT NULL DEFAULT '{}',
  order_index        integer NOT NULL DEFAULT 0,       -- urutan di list/board (per project+status)
  agent_status       agent_work_status NOT NULL DEFAULT 'idle',
  created_by_type    actor_type NOT NULL DEFAULT 'user',
  created_by_id      uuid,                             -- users.id atau agents.id
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT tasks_assignee_consistent CHECK (
       (assignee_type IS NULL    AND assignee_user_id IS NULL     AND assignee_agent_id IS NULL)
    OR (assignee_type = 'user'   AND assignee_user_id IS NOT NULL AND assignee_agent_id IS NULL)
    OR (assignee_type = 'agent'  AND assignee_agent_id IS NOT NULL AND assignee_user_id IS NULL)),
  CONSTRAINT tasks_date_range    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT tasks_milestone     CHECK (NOT is_milestone OR (start_date IS NOT NULL AND end_date = start_date)),
  CONSTRAINT tasks_not_own_parent CHECK (parent_task_id IS NULL OR parent_task_id <> id),
  CONSTRAINT tasks_tags_limit    CHECK (cardinality(tags) <= 20)
);
CREATE INDEX tasks_project_idx        ON tasks (project_id, status, order_index) WHERE deleted_at IS NULL;
CREATE INDEX tasks_parent_idx         ON tasks (parent_task_id)                  WHERE deleted_at IS NULL;
CREATE INDEX tasks_timeline_idx       ON tasks (project_id, start_date)          WHERE deleted_at IS NULL;
CREATE INDEX tasks_assignee_user_idx  ON tasks (assignee_user_id)                WHERE deleted_at IS NULL;
CREATE INDEX tasks_assignee_agent_idx ON tasks (assignee_agent_id)               WHERE deleted_at IS NULL;
CREATE INDEX tasks_tags_idx           ON tasks USING gin (tags);

-- ===== Document Blocks =====
CREATE TABLE document_blocks (
  id                   uuid PRIMARY KEY,               -- boleh dibuat client (UUID v4)
  project_id           uuid NOT NULL REFERENCES projects(id),
  task_id              uuid REFERENCES tasks(id),      -- NULL = blok Project Brief
  parent_block_id      uuid REFERENCES document_blocks(id),
  block_type           varchar(32) NOT NULL,           -- divalidasi aplikasi (TASK_003 §Block format)
  content_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  plain_text           text NOT NULL DEFAULT '',       -- diekstrak server dari content_json
  order_index          integer NOT NULL,
  version              integer NOT NULL DEFAULT 1,     -- optimistic locking
  last_edited_by_type  actor_type NOT NULL DEFAULT 'user',
  last_edited_by_id    uuid,
  search_vector        tsvector GENERATED ALWAYS AS (to_tsvector('simple', plain_text)) STORED,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CONSTRAINT blocks_size CHECK (pg_column_size(content_json) <= 65536)
);
CREATE INDEX blocks_task_tree_idx    ON document_blocks (task_id, parent_block_id, order_index) WHERE deleted_at IS NULL;
CREATE INDEX blocks_project_brief_idx ON document_blocks (project_id, parent_block_id, order_index) WHERE task_id IS NULL AND deleted_at IS NULL;
CREATE INDEX blocks_search_idx       ON document_blocks USING gin (search_vector);

-- ===== Comments =====
CREATE TABLE comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id),
  entity_type        entity_type NOT NULL CHECK (entity_type IN ('project','task','block')),
  entity_id          uuid NOT NULL,
  parent_comment_id  uuid REFERENCES comments(id),     -- thread (1 level)
  author_type        actor_type NOT NULL CHECK (author_type IN ('user','agent','system')),
  author_user_id     uuid REFERENCES users(id),
  author_agent_id    uuid REFERENCES agents(id),
  content            text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
  mentions           jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ "type":"user|agent", "id":"uuid" }]
  edited_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX comments_entity_idx ON comments (entity_type, entity_id, created_at) WHERE deleted_at IS NULL;

-- ===== Activity Logs (append-only) =====
CREATE TABLE activity_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id),
  project_id     uuid REFERENCES projects(id),
  entity_type    entity_type NOT NULL,
  entity_id      uuid NOT NULL,
  action         varchar(64) NOT NULL,                 -- lihat katalog TASK_002 §Activity
  actor_type     actor_type NOT NULL,
  actor_id       uuid,
  metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- mis. { "changes": { "status": { "from":"todo","to":"done" } } }
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_project_idx ON activity_logs (project_id, created_at DESC);
CREATE INDEX activity_entity_idx  ON activity_logs (entity_type, entity_id, created_at DESC);

-- ===== Notifications =====
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  type          varchar(48) NOT NULL,                  -- task_assigned | comment_mention | agent_comment | agent_task_completed | agent_task_failed
  title         varchar(200) NOT NULL,
  body          text,
  project_id    uuid REFERENCES projects(id),
  entity_type   entity_type,
  entity_id     uuid,
  actor_type    actor_type,
  actor_id      uuid,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- ===== Agent Runs & Webhook Idempotency =====
CREATE TABLE agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- = run_id di kontrak MCP
  workspace_id      uuid NOT NULL REFERENCES workspaces(id),
  project_id        uuid NOT NULL REFERENCES projects(id),
  task_id           uuid REFERENCES tasks(id),                    -- NULL untuk mention di level project
  agent_id          uuid NOT NULL REFERENCES agents(id),
  trigger           agent_run_trigger NOT NULL,
  trigger_ref_id    uuid,                                         -- comment_id / block_id pemicu
  status            agent_run_status NOT NULL DEFAULT 'queued',
  mcp_run_id        varchar(200),
  dispatched_by     uuid REFERENCES users(id),
  attempts          smallint NOT NULL DEFAULT 0,
  last_error        jsonb,                                        -- { code, message, retryable }
  last_event_at     timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_runs_one_active_assignment ON agent_runs (task_id)
  WHERE trigger = 'assignment' AND status IN ('queued','dispatched','running');
CREATE INDEX agent_runs_active_idx ON agent_runs (status, last_event_at) WHERE status IN ('queued','dispatched','running');

CREATE TABLE mcp_webhook_events (
  event_id      uuid PRIMARY KEY,
  run_id        uuid REFERENCES agent_runs(id),
  event_type    varchar(64) NOT NULL,
  status        varchar(16) NOT NULL DEFAULT 'processing',   -- processing | processed | rejected
  error         jsonb,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);
```

### B.2 Aturan Data Penting
- **Soft delete:** `deleted_at` di workspaces, agents, projects, tasks, document_blocks, comments. Semua query default memfilter `deleted_at IS NULL` (Prisma client extension). Hard delete tidak dilakukan di M1.
- **`updated_at`** dikelola Prisma `@updatedAt`.
- **`depth`** dihitung server: root task = 1, subtask = depth parent + 1.
- **`plain_text`** blok diisi server dari `content_json` (gabungan teks inline + sel tabel) — dipakai FTS & `task_description` untuk agent.
- Kolom polimorfik (`created_by_id`, `last_edited_by_id`, `actor_id`) tidak memakai FK; integritas dijaga di service layer.

### B.3 Seed Data
- [ ] `prisma/seed.ts` idempotent (bisa dijalankan ulang). Isi persis sesuai [ARCHITECTURE §10](M1_ARCHITECTURE.md#10-menjalankan-modul-1-secara-lokal): 5 user demo, workspace "Matrika Demo" + "Outsider WS", 2 agent, project "Q4 Product Launch" (task "Market Research" 1–5 Nov tahun berjalan + 2 subtask, milestone "Launch Day"), 3 blok Project Brief (heading "Brief Kampanye Q4", paragraf target audiens, paragraf tone of voice).
- [ ] Seed **ditolak** jika `NODE_ENV=production`.

## C. Security & Auth
- [ ] Setup JWT Authentication (Access Token & Refresh Token).
- [ ] Implementasi RBAC (Role-Based Access Control): `Owner`, `Admin`, `Member`, `Viewer` per workspace.
- [ ] Setup Rate Limiting (Redis-based) untuk mencegah spam API, terutama pada endpoint block editor.
- [ ] Implementasi Input Sanitization & validasi (DOMPurify di frontend bila merender HTML, validasi schema di backend) untuk mencegah XSS pada block editor.

### C.1 Endpoint Auth
| Method & Path | Body | Respons |
|---|---|---|
| `POST /api/v1/auth/register` | `{ email, username, display_name, password }` | 201 `{ user, access_token, expires_in }` + cookie refresh. Otomatis membuat workspace "`<display_name>`'s Workspace" dengan user sebagai Owner |
| `POST /api/v1/auth/login` | `{ identifier, password }` (identifier = email atau username) | 200 `{ user, access_token, expires_in }` + cookie refresh |
| `POST /api/v1/auth/refresh` | — (cookie `refresh_token`) | 200 `{ access_token, expires_in }` + cookie refresh baru |
| `POST /api/v1/auth/logout` | — | 204, revoke seluruh family token sesi ini, hapus cookie |
| `GET /api/v1/auth/me` | — | 200 `{ user, workspaces: [{ id, name, role }] }` |

Aturan:
- Password: minimal 10 karakter, mengandung huruf dan angka, maksimal 128; hash **argon2id** (memoryCost 19 MiB, timeCost 2, parallelism 1 — sesuai rekomendasi OWASP).
- Pesan login gagal selalu generik: `"Email/username atau password salah"` (tidak membedakan user tidak ada vs password salah). User `is_active = false` → 401 yang sama.
- Access token: JWT HS256, payload `{ sub: user_id, iat, exp, jti }`, TTL 15 menit. **Role tidak disimpan di token** (dicek dari DB/cache per request agar perubahan role langsung berlaku).
- Refresh token: 32 byte acak (base64url), disimpan sebagai SHA-256 hash, TTL 7 hari, cookie `httpOnly; Secure (non-lokal); SameSite=Lax; Path=/api/v1/auth`.
- **Rotasi:** setiap refresh mengeluarkan token baru (`replaced_by`) dan me-revoke token lama. **Deteksi reuse:** jika token yang sudah di-revoke dipakai lagi → revoke seluruh `family_id` (paksa login ulang) + log peringatan.
- Global `JwtAuthGuard` aktif default; endpoint publik ditandai decorator `@Public()`.

<a id="rbac"></a>
### C.2 RBAC
Implementasi: decorator `@RequireRole('member')` + `WorkspaceAccessGuard` yang me-resolve `workspace_id` dari resource di URL (project → workspace, task → project → workspace, dst.). Membership di-cache di Redis 60 detik (invalidasi saat role berubah).

- Bukan anggota workspace → **404 `NOT_FOUND`** (anti-IDOR, tidak membocorkan keberadaan resource).
- Anggota dengan role kurang → **403 `FORBIDDEN`**.

| Aksi | Owner | Admin | Member | Viewer |
|---|:-:|:-:|:-:|:-:|
| Lihat workspace, project, task, blok, komentar, activity | ✅ | ✅ | ✅ | ✅ |
| Ubah nama/timezone workspace | ✅ | ✅ | ❌ | ❌ |
| Hapus workspace / transfer ownership | ✅ | ❌ | ❌ | ❌ |
| Tambah/ubah role/hapus member | ✅ | ✅ (tidak bisa mengubah Owner atau menjadikan Owner) | ❌ | ❌ |
| Kelola agent (tambah, ubah, nonaktifkan) | ✅ | ✅ | ❌ | ❌ |
| Buat project | ✅ | ✅ | ✅ | ❌ |
| Ubah project | ✅ | ✅ | ✅ | ❌ |
| Hapus project | ✅ | ✅ | Hanya buatannya | ❌ |
| Buat/ubah task, subtask, blok; reschedule; assign (user/agent) | ✅ | ✅ | ✅ | ❌ |
| Hapus task | ✅ | ✅ | ✅ | ❌ |
| Komentar | ✅ | ✅ | ✅ | ❌ (README D5) |
| Ubah/hapus komentar | Milik sendiri; Owner/Admin boleh hapus semua | Milik sendiri + hapus semua | Milik sendiri | ❌ |

### C.3 Rate Limiting
`@nestjs/throttler` dengan storage Redis. Key = `user_id` (terautentikasi) atau IP (publik).

| Grup endpoint | Batas | Key |
|---|---|---|
| `POST /auth/login`, `/auth/register` | 5 / menit, 20 / jam | IP + identifier |
| `POST /auth/refresh` | 30 / menit | IP |
| Block write (`/blocks*` POST/PATCH/DELETE, `/blocks/batch`) | 120 / menit | user |
| Komentar (`POST /comments`) | 30 / menit | user |
| API umum lainnya | 300 / menit | user |
| Webhook MCP | 600 / menit | agent_id |
| Agent API | 300 / menit | run_id |

Respons 429 `RATE_LIMITED` + header `Retry-After`. Bisa dimatikan via `RATE_LIMIT_ENABLED=false` (hanya untuk load test terisolasi).

### C.4 Sanitasi & Validasi Input
Prinsip: **konten disimpan sebagai data terstruktur (JSON), bukan HTML**, dan selalu dirender sebagai teks oleh React/ProseMirror. Karena itu pertahanan utama adalah **validasi schema ketat**, bukan membersihkan HTML.
- [ ] Schema Zod per `block_type` di `packages/shared` (TASK_003 §Block format): properti yang tidak dikenal dibuang, tipe & panjang dicek, struktur rekursif dibatasi kedalaman 10.
- [ ] URL (`link.href`, `image.url`, `bookmark.url`) hanya boleh skema `http:`/`https:` (link juga `mailto:`), maks 2048 karakter. `javascript:`, `data:`, `vbscript:` ditolak.
- [ ] Teks: buang karakter kontrol (kecuali `\n`, `\t`), maks 10.000 karakter per inline text.
- [ ] Komentar & judul: plain text, dirender sebagai teks (tanpa `dangerouslySetInnerHTML`).
- [ ] Frontend: DOMPurify **wajib** di setiap tempat yang terpaksa merender HTML (mis. hasil syntax highlighting code block). Lint rule melarang `dangerouslySetInnerHTML` di luar komponen `SafeHtml`.
- [ ] Header keamanan via Helmet; CSP frontend: `default-src 'self'; img-src 'self' https: data:; connect-src 'self' <API_URL> <WS_URL>; script-src 'self'; object-src 'none'; frame-ancestors 'none'`.
- [ ] Body limit global 1 MB.

## D. Implementation Steps (urutan)
1. [ ] Setup monorepo & tooling (A).
2. [ ] `packages/shared`: enum & schema Zod dasar (role, status, priority, error codes).
3. [ ] Prisma schema + migrasi awal + SQL manual (B.1), jalankan dari nol di DB kosong.
4. [ ] Seed (B.3).
5. [ ] Modul auth (C.1) + guard global + `@Public()`.
6. [ ] `WorkspaceAccessGuard` + `@RequireRole` (C.2) + helper resolve workspace dari resource.
7. [ ] Throttler Redis (C.3).
8. [ ] Exception filter & format error, request id, logger, Helmet, CORS, Swagger, health.
9. [ ] Unit & integration test (§F).

## E. Acceptance Criteria
- `pnpm --filter api prisma migrate deploy` berhasil di database kosong; `db:seed` berhasil dan bisa dijalankan ulang.
- Endpoint `/api/v1/auth/register` dan `/api/v1/auth/login` berfungsi dan mengembalikan JWT + cookie refresh token.
- `/auth/refresh` merotasi token; memakai refresh token lama untuk kedua kalinya membuat seluruh sesi family tidak berlaku.
- Guard auth memblokir request tanpa token / token invalid / expired (401) di semua endpoint non-publik.
- Viewer mendapat 403 saat membuat task; user non-anggota mendapat 404 saat mengakses project workspace lain.
- Login ke-6 dalam 1 menit dari IP yang sama mendapat 429.
- Aplikasi gagal start dengan pesan jelas jika `JWT_ACCESS_SECRET` kosong/terlalu pendek.
- `GET /health` mengembalikan status DB & Redis.

## F. Testing
- Unit: hashing & verifikasi password, rotasi & reuse detection refresh token, guard RBAC (matriks C.2 sebagai tabel test), validator URL.
- Integration (Supertest + Testcontainers): register → login → me → refresh → logout; skenario 401/403/404/429.
