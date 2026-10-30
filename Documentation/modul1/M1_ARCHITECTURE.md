# Architecture & Developer Guide
## Modul 1: Agentic Project Management

Dokumen ini adalah acuan teknis lintas task: stack, struktur repo, konvensi API, real-time, background job, environment variable, dan **cara menjalankan Modul 1 secara lokal**.

---

### 1. Gambaran Sistem

```mermaid
flowchart LR
  subgraph Browser
    WEB[Web App<br/>Vite + React + TS]
  end
  subgraph Backend["Dashboard Backend (NestJS)"]
    API[REST API /api/v1]
    WS[Socket.IO Gateway /realtime]
    WH[Webhook Receiver<br/>/api/v1/webhooks/mcp/events]
    AAPI[Agent API<br/>/api/v1/agent-api]
    Q[BullMQ Workers<br/>mcp-outbound]
  end
  PG[(PostgreSQL)]
  RD[(Redis<br/>rate limit, queue,<br/>socket adapter)]
  MCP[Custom MCP Server<br/>Project 2 / Mock MCP]

  WEB -- HTTPS + JWT --> API
  WEB <-- WebSocket + JWT --> WS
  API --> PG
  API --> RD
  API -- enqueue --> Q
  Q -- "MCP tools/call (Streamable HTTP)" --> MCP
  MCP -- "Webhook (HMAC)" --> WH
  MCP -- "Service token" --> AAPI
  WH --> PG
  WH -- emit --> WS
  AAPI --> PG
```

Prinsip utama:
- **Backend adalah satu-satunya sumber kebenaran.** Frontend dan Agent sama-sama menulis lewat backend; semua perubahan disiarkan ulang via Socket.IO.
- **Komunikasi ke MCP selalu asinkron lewat queue**, sehingga request user (mis. assign task ke agent) tidak pernah gagal/lambat karena MCP Server down.
- **Semua akses data di-scope ke workspace** (anti-IDOR): setiap query melewati pengecekan membership.

### 2. Tech Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Runtime | Node.js **24 LTS** | LTS aktif, didukung NestJS & Vite |
| Package manager | **pnpm** workspaces | Monorepo ringan, berbagi package `shared` |
| Backend framework | **NestJS** (versi stable terbaru, lihat README D1) | Sesuai PRD |
| ORM & migrasi | **Prisma** | Type-safe, migrasi deklaratif; SQL khusus (partial index, generated column, CHECK) ditulis manual di file migrasi |
| Database | **PostgreSQL 17** | Sesuai PRD; JSONB, full-text search, partial index |
| Cache/Queue | **Redis 7** + **BullMQ** | Rate limit, job queue MCP, Socket.IO adapter |
| Validasi | **Zod** (schema di `packages/shared`) + `nestjs-zod` | Satu schema dipakai backend, frontend, dan Mock MCP |
| Auth | JWT access token (15 menit) + refresh token opaque (7 hari, httpOnly cookie, rotasi) ; password hash **argon2id** | Lihat TASK_001 |
| Real-time | **Socket.IO** (`@nestjs/websockets`) + `@socket.io/redis-adapter` | Room per project/task/user, auto-reconnect |
| MCP client | `@modelcontextprotocol/sdk` (Streamable HTTP transport) | SDK resmi MCP |
| Logging | `nestjs-pino` (JSON) | Siap dikirim ke ELK/Datadog |
| API docs | `@nestjs/swagger` di `/api/docs` | Kontrak terdokumentasi otomatis |
| Health | `@nestjs/terminus` di `/health` | Untuk load balancer & monitoring |
| Frontend | **Vite + React + TypeScript** (versi stable terbaru) | Lihat README D8 |
| Routing | React Router | |
| Server state | **TanStack Query** | Cache bersama untuk 3 view, optimistic update |
| UI state | **Zustand** | View switcher, preferensi tampilan |
| Styling & komponen | **Tailwind CSS + shadcn/ui** + ikon **lucide-react** | Token design system dipetakan ke CSS variables |
| Block editor | **BlockNote** (paket core, lisensi MPL-2.0) | Lihat TASK_005 |
| Tabel | **TanStack Table** + **TanStack Virtual** | Lihat TASK_006 |
| Drag & drop | **dnd-kit** | Board & reorder |
| Gantt | Lihat README D2 | Lihat TASK_006 |
| Toast | **sonner** | |
| Testing | Jest/Vitest, Supertest, Testcontainers, Playwright, k6 | Lihat TASK_008 |

> Semua versi library di-*pin* (tanpa `^`) di `package.json` setelah spike Sprint 0, dan di-update terkontrol via Renovate/Dependabot.

### 3. Struktur Repository (monorepo)

```
dashboard-marketing/
├── apps/
│   ├── api/                      # NestJS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/           # guards, interceptors, filters, pipes, decorators
│   │   │   ├── config/           # validasi env (zod)
│   │   │   ├── auth/             # TASK_001
│   │   │   ├── workspaces/       # TASK_002 (+ members, assignees)
│   │   │   ├── agents/           # TASK_002
│   │   │   ├── projects/         # TASK_002
│   │   │   ├── tasks/            # TASK_002 (+ reorder, move)
│   │   │   ├── comments/         # TASK_002
│   │   │   ├── activity/         # TASK_002
│   │   │   ├── notifications/    # TASK_002
│   │   │   ├── agent-runs/       # TASK_002 (dispatch, MCP client, queue worker)
│   │   │   ├── blocks/           # TASK_003
│   │   │   ├── timeline/         # TASK_003
│   │   │   ├── webhooks/         # TASK_003
│   │   │   ├── agent-api/        # TASK_003
│   │   │   ├── realtime/         # TASK_003
│   │   │   └── health/
│   │   └── test/                 # integration / e2e API tests
│   ├── web/                      # React frontend
│   │   └── src/
│   │       ├── app/              # router, providers
│   │       ├── lib/              # api client, socket client, date utils
│   │       ├── features/
│   │       │   ├── auth/
│   │       │   ├── workspace/    # sidebar, settings, members, agents
│   │       │   ├── projects/     # header, view switcher, brief page
│   │       │   ├── tasks/        # task detail, properties panel
│   │       │   ├── editor/       # TASK_005
│   │       │   ├── views/        # list/, board/, timeline/  (TASK_006)
│   │       │   ├── collaboration/# comments, activity, agent status (TASK_007)
│   │       │   └── notifications/
│   │       └── components/ui/    # shadcn/ui
│   └── mock-mcp/                 # TASK_009
├── packages/
│   └── shared/                   # zod schemas + types: enums, DTO, block schema, MCP contract
├── e2e/                          # Playwright
├── load-tests/                   # k6
├── docker/
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   └── mock-mcp.Dockerfile
├── docker-compose.yml
├── .github/workflows/
├── .env.example
└── pnpm-workspace.yaml
```

### 4. Konvensi API

| Aspek | Aturan |
|---|---|
| Base URL | `/api/v1` |
| Format | JSON, **snake_case** untuk semua field (sama dengan kolom DB) |
| Auth | Header `Authorization: Bearer <access_token>` (kecuali `/auth/*`, `/health`, webhook, agent-api) |
| ID | UUID (string). ID block boleh dibuat oleh client (UUID v4) |
| Tanggal | `start_date`/`end_date`: string `YYYY-MM-DD` (tanpa jam/zona waktu, inklusif). Timestamp: ISO 8601 UTC (`2026-11-01T08:00:00.000Z`) |
| Pagination | Cursor: `?limit=50&cursor=<opaque>` → respons `{ "data": [...], "next_cursor": "..." \| null }`. Default 50, maks 200 |
| Respons sukses | Objek tunggal dikembalikan langsung; list dibungkus `{ "data": [], "next_cursor": null }` |
| Header klien | `X-Client-Id: <uuid per tab browser>` dikirim di setiap request; backend menyertakan `origin_client_id` di event real-time agar klien bisa mengabaikan echo dari perubahannya sendiri |
| Request ID | Backend mengembalikan `X-Request-Id` di setiap respons dan menuliskannya di log |

**Format error (semua endpoint):**
```json
{
  "error": {
    "code": "INVALID_DATE_RANGE",
    "message": "end_date tidak boleh lebih kecil dari start_date",
    "details": { "field": "end_date" }
  },
  "request_id": "b3c1..."
}
```

| HTTP | `code` | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query tidak sesuai schema (detail per field) |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_SIGNATURE` | Token tidak ada/invalid/expired; signature webhook salah |
| 403 | `FORBIDDEN` | User anggota workspace tapi role tidak cukup |
| 404 | `NOT_FOUND`, `USER_NOT_FOUND` | Resource tidak ada **atau user bukan anggota workspace pemiliknya** (tidak membocorkan keberadaan resource) |
| 409 | `VERSION_CONFLICT`, `CASCADE_DECISION_REQUIRED`, `RUN_NOT_ACTIVE`, `ALREADY_EXISTS` | Konflik state |
| 422 | `INVALID_DATE_RANGE`, `HIERARCHY_DEPTH_EXCEEDED`, `CIRCULAR_HIERARCHY`, `CROSS_PROJECT_PARENT`, `AGENT_INACTIVE`, `INVALID_ASSIGNEE`, `LAST_OWNER` | Pelanggaran aturan bisnis |
| 429 | `RATE_LIMITED` | Disertai header `Retry-After` |
| 500 | `INTERNAL_ERROR` | Error tak terduga (detail hanya di log/Sentry) |

### 5. Autentikasi & Sesi (ringkas — detail di TASK_001)

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  B->>A: POST /auth/login {identifier, password}
  A-->>B: 200 {access_token, user} + Set-Cookie refresh_token (httpOnly, Secure, SameSite=Lax, Path=/api/v1/auth)
  B->>A: GET /projects/... (Authorization: Bearer access_token)
  A-->>B: 401 TOKEN_EXPIRED (setelah 15 menit)
  B->>A: POST /auth/refresh (cookie)
  A-->>B: 200 {access_token} + Set-Cookie refresh_token baru (rotasi)
  B->>A: ulangi request awal
```
- Access token disimpan **di memori** (bukan localStorage). Saat reload halaman, frontend memanggil `/auth/refresh` untuk mendapatkan access token baru.
- Frontend dan API harus berada di **site yang sama** (mis. `app.domain.com` & `api.domain.com`) agar cookie `SameSite=Lax` terkirim. Jika beda site, gunakan `SameSite=None; Secure` dan proteksi CSRF tambahan (header `X-Requested-With` wajib di `/auth/refresh`).

### 6. Real-time (Socket.IO)

- URL: `${API_URL}/realtime` (namespace `/realtime`), transport WebSocket dengan fallback polling.
- Auth: `io(url, { auth: { token: access_token } })`. Token diverifikasi saat handshake; jika expired, server memutus dengan error `TOKEN_EXPIRED` dan klien reconnect setelah refresh token.
- Setiap user otomatis bergabung ke room `user:{user_id}` (notifikasi).
- Klien bergabung/keluar room via event `room.join` / `room.leave` dengan payload `{ "type": "project" | "task", "id": "<uuid>" }`. Server memverifikasi membership workspace sebelum join; ack `{ "ok": true }` atau `{ "ok": false, "error": "NOT_FOUND" }`.
- Multi-instance backend memakai Redis adapter; load balancer **wajib sticky session** jika fallback polling diaktifkan.

**Event server → klien** (semua payload menyertakan `event_id`, `occurred_at`, `actor: {type, id, name}`, `origin_client_id`):

| Event | Room | Payload utama |
|---|---|---|
| `task.created` | `project:{id}` | `{ task }` |
| `task.updated` | `project:{id}`, `task:{id}` | `{ task, changed_fields: [] }` |
| `task.deleted` | `project:{id}` | `{ task_id, deleted_ids: [] }` (termasuk subtask) |
| `tasks.rescheduled` | `project:{id}` | `{ tasks: [] }` |
| `tasks.reordered` | `project:{id}` | `{ status, ordered_task_ids: [] }` |
| `block.upserted` | `task:{id}` atau `project:{id}` (brief) | `{ task_id, project_id, blocks: [] }` |
| `block.deleted` | idem | `{ task_id, project_id, block_ids: [] }` |
| `blocks.reordered` | idem | `{ task_id, parent_block_id, ordered_ids: [] }` |
| `comment.created` / `comment.updated` / `comment.deleted` | `task:{id}` / `project:{id}` | `{ comment }` / `{ comment_id }` |
| `activity.created` | `project:{id}` | `{ activity }` |
| `agent.status` | `project:{id}`, `task:{id}` | `{ task_id, agent_id, run_id, status, message }` |
| `notification.created` | `user:{id}` | `{ notification, unread_count }` |

Saat reconnect, klien **wajib** meng-invalidate query aktif (refetch) karena event selama terputus tidak di-replay.

### 7. Alur Agent (ringkas — detail di M1_MCP_INTEGRATION)

```mermaid
sequenceDiagram
  participant U as User
  participant API as Dashboard API
  participant Q as Queue (BullMQ)
  participant M as MCP Server
  U->>API: PATCH /tasks/:id {assignee: agent}
  API->>API: buat agent_run (queued), task.agent_status = queued
  API-->>U: 200 task
  API->>Q: job agent.dispatch
  Q->>M: tools/call pm_request_agent_estimation (jika task belum punya tanggal)
  M-->>Q: {start_date, end_date, message}
  Q->>API: update tanggal + komentar agent
  Q->>M: tools/call pm_dispatch_task_to_agent
  M-->>Q: {accepted: true, mcp_run_id}
  M->>API: webhook agent.task.started / agent.status.changed / agent.block.appended / ...
  API-->>U: Socket.IO task.updated, block.upserted, agent.status, notification.created
```

### 8. Background Jobs (BullMQ)

| Queue | Job | Retry | Keterangan |
|---|---|---|---|
| `mcp-outbound` | `agent.dispatch` | 5x, backoff eksponensial (10s, 20s, 40s, 80s, 160s) | Estimasi (opsional) + dispatch. Gagal final → run `failed`, notifikasi |
| `mcp-outbound` | `agent.mention` | 5x | Kirim `pm_notify_agent_mention` |
| `mcp-outbound` | `agent.prompt_block` | 5x | Kirim `pm_execute_prompt_block` (P1) |
| `mcp-outbound` | `agent.cancel` | 3x | Kirim `pm_cancel_agent_run`; gagal final hanya di-log |
| `maintenance` | `runs.timeout_sweeper` | cron tiap 5 menit | Run `dispatched/running` tanpa event > `AGENT_RUN_TIMEOUT_MINUTES` → `failed` |
| `maintenance` | `tokens.cleanup` | cron harian | Hapus refresh token expired > 30 hari |

Worker berjalan di proses yang sama dengan API untuk M1 (bisa dipisah dengan env `RUN_WORKERS=true/false`).

### 9. Environment Variables

**apps/api**
| Variable | Contoh (lokal) | Keterangan |
|---|---|---|
| `NODE_ENV` | `development` | |
| `PORT` | `3000` | |
| `APP_URL` | `http://localhost:5173` | Origin frontend (CORS & Socket.IO), boleh dipisah koma |
| `PUBLIC_API_URL` | `http://localhost:3000` | Dipakai menyusun `callback_url` webhook untuk MCP |
| `DATABASE_URL` | `postgresql://marketing:marketing@localhost:5432/marketing_m1` | |
| `REDIS_URL` | `redis://localhost:6379` | |
| `JWT_ACCESS_SECRET` | *(random 64 byte)* | Wajib ≥ 32 karakter |
| `JWT_ACCESS_TTL` | `15m` | |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | |
| `COOKIE_DOMAIN` | *(kosong di lokal)* | mis. `.domain.com` di produksi |
| `COOKIE_SECURE` | `false` | `true` di staging/produksi |
| `MCP_SERVER_URL` | `http://localhost:4100/mcp` | Endpoint Streamable HTTP MCP Server |
| `MCP_SERVER_API_KEY` | *(random)* | Dashboard → MCP (Bearer) |
| `MCP_WEBHOOK_SECRET` | *(random)* | HMAC webhook MCP → Dashboard |
| `MCP_SERVICE_TOKEN` | *(random)* | MCP → Agent API (Bearer) |
| `MCP_CALL_TIMEOUT_MS` | `15000` | Timeout tool async (dispatch, mention, cancel) |
| `MCP_ESTIMATION_TIMEOUT_MS` | `30000` | Timeout `pm_request_agent_estimation` |
| `AGENT_RUN_TIMEOUT_MINUTES` | `120` | Run tanpa aktivitas dianggap gagal |
| `RUN_WORKERS` | `true` | |
| `RATE_LIMIT_ENABLED` | `true` | |
| `FEATURE_AI_PROMPT_BLOCK` | `false` | README D9 |
| `SENTRY_DSN` | *(kosong di lokal)* | |
| `LOG_LEVEL` | `debug` | `info` di produksi |
| `SEED_DEMO_PASSWORD` | `Demo12345!` | Hanya untuk seed lokal/staging |

**apps/web** (prefix `VITE_` = terekspos ke browser, **jangan** isi secret)
| Variable | Contoh |
|---|---|
| `VITE_API_URL` | `http://localhost:3000/api/v1` |
| `VITE_WS_URL` | `http://localhost:3000/realtime` |
| `VITE_SENTRY_DSN` | *(kosong)* |
| `VITE_APP_ENV` | `local` |
| `VITE_FEATURE_AI_PROMPT_BLOCK` | `false` |

**apps/mock-mcp** — lihat [TASK_009](M1_TASK_009_MOCK_MCP_DEVTOOLS.md#konfigurasi). `MCP_SERVER_API_KEY`, `MCP_WEBHOOK_SECRET`, `MCP_SERVICE_TOKEN` **harus sama** dengan apps/api.

Konfigurasi divalidasi dengan Zod saat startup; aplikasi **gagal start** jika variabel wajib kosong atau secret terlalu pendek.

### 10. Menjalankan Modul 1 Secara Lokal

**Prasyarat:** Node.js 24 LTS, pnpm (via `corepack enable`), Docker + Docker Compose, Git.

```bash
# 1. Install dependency
pnpm install

# 2. Siapkan env (lalu isi secret dengan: openssl rand -base64 48)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/mock-mcp/.env.example apps/mock-mcp/.env

# 3. Jalankan PostgreSQL & Redis
docker compose up -d postgres redis

# 4. Migrasi & seed
pnpm --filter api prisma migrate deploy
pnpm --filter api db:seed

# 5. Jalankan api + web + mock-mcp sekaligus
pnpm dev
```

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| Swagger | http://localhost:3000/api/docs |
| Health | http://localhost:3000/health |
| Mock MCP | http://localhost:4100/mcp |

Alternatif semua di Docker: `docker compose --profile full up --build`.

**Akun demo hasil seed** (password = `SEED_DEMO_PASSWORD`):

| Email | Role di workspace "Marketing Demo" |
|---|---|
| `owner@demo.local` | Owner |
| `manager@demo.local` | Admin (Marketing Manager di UC4) |
| `member@demo.local` | Member |
| `viewer@demo.local` | Viewer |
| `outsider@demo.local` | Bukan anggota (untuk tes IDOR) — punya workspace sendiri "Outsider WS" |

Seed juga membuat agent `Agent_Strategist` (`mcp_agent_key: strategist`) dan `Agent_Researcher` (`mcp_agent_key: researcher`), project **"Q4 Product Launch"** berisi task "Market Research" (1–5 Nov) dengan subtask "Scrape Twitter" & "Scrape Meta", satu milestone "Launch Day", serta 3 blok di Project Brief.

**Smoke test manual (5 menit):** login sebagai `owner@demo.local` → buka "Q4 Product Launch" → buat task "Generate Content Calendar" → assign ke `@Agent_Strategist` → dalam ±15 detik Mock MCP akan mengisi tanggal, menulis blok, membuat 3 subtask, berkomentar, dan menandai task `done` (UC2 + UC3).

**docker-compose.yml (referensi):**
```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: marketing
      POSTGRES_PASSWORD: marketing
      POSTGRES_DB: marketing_m1
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U marketing"]
      interval: 5s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  api:
    profiles: [full]
    build: { context: ., dockerfile: docker/api.Dockerfile }
    env_file: apps/api/.env
    environment:
      DATABASE_URL: postgresql://marketing:marketing@postgres:5432/marketing_m1
      REDIS_URL: redis://redis:6379
      MCP_SERVER_URL: http://mock-mcp:4100/mcp
      PUBLIC_API_URL: http://api:3000
    ports: ["3000:3000"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
  mock-mcp:
    profiles: [full]
    build: { context: ., dockerfile: docker/mock-mcp.Dockerfile }
    env_file: apps/mock-mcp/.env
    environment:
      DASHBOARD_API_URL: http://api:3000/api/v1
    ports: ["4100:4100"]
  web:
    profiles: [full]
    build: { context: ., dockerfile: docker/web.Dockerfile }
    ports: ["5173:80"]
volumes:
  pgdata:
```

### 11. Script Standar (root `package.json`)

| Script | Fungsi |
|---|---|
| `pnpm dev` | Jalankan api, web, mock-mcp paralel (watch mode) |
| `pnpm build` | Build semua app |
| `pnpm lint` / `pnpm typecheck` | ESLint & tsc di semua package |
| `pnpm test` | Unit test semua package |
| `pnpm test:integration` | Integration test API (Testcontainers) |
| `pnpm test:e2e` | Playwright terhadap stack docker compose |
| `pnpm --filter api db:reset` | Drop, migrate, seed ulang DB lokal |

### 12. Observability
- Setiap log berisi `request_id`, `user_id` (jika ada), `workspace_id`, `run_id` (untuk alur agent). **Jangan** log password, token, isi `content_json` penuh, atau secret.
- Sentry: backend (exception filter global) & frontend (ErrorBoundary + tracing route).
- Metrik minimum (bisa dari log): latency p95 per endpoint, jumlah job `mcp-outbound` gagal, jumlah webhook ditolak (signature/validation), jumlah koneksi socket aktif.
