# Backend — Modul 1 Agentic Project Management

NestJS + Prisma + PostgreSQL + Redis. Mengimplementasikan **M1_TASK_001** (DB, auth, RBAC, rate limit, sanitasi),
**M1_TASK_002** (core API + dispatch agent) dan **M1_TASK_003** (block editor, timeline, webhook MCP, Agent API, real-time).
Spesifikasi: [`../Documentation/modul1/`](../Documentation/modul1/README.md).

## Menjalankan
Lihat [README root](../README.md) untuk mode Docker & non-Docker. Ringkas (non-Docker):
```bash
cd backend                      # PostgreSQL & Redis sudah berjalan sesuai .env root
npm install                     # sekaligus menjalankan `prisma generate`
npm run db:setup                # build → buat database → migrasi → seed demo
npm run dev                     # http://localhost:3000
```
- Konfigurasi dibaca dari **`.env` di root project** (satu file untuk backend & frontend), lihat [`../.env.example`](../.env.example).
- API: `/api/v1` — Swagger: `/api/docs` — Health: `/health` — Socket.IO namespace `/realtime`.
- Koneksi Redis: `REDIS_URL` atau `REDIS_HOST/PORT/USERNAME/PASSWORD/DB` (lihat `src/config/redis-url.ts`).
- Docker image dibangun dari root: `docker build -f Dockerfile.backend .` (dipakai `docker-compose.yml` di root).

## Script
| Script | Fungsi |
|---|---|
| `npm run dev` | Build + watch (tsc --watch & node --watch) |
| `npm run build` / `npm start` | Build produksi / jalankan `dist/` |
| `npm run start:prod` | `prisma migrate deploy` lalu start (dipakai Dockerfile) |
| `npm test` / `npm run test:cov` | Unit test (Jest + SWC) |
| `npm run typecheck` | Cek tipe seluruh kode + test |
| `npm run db:setup` | Buat DB (jika belum ada) + migrasi + seed |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:seed` / `db:seed:large` | Data demo / data performa (1000 task + 1000 blok) |
| `npm run mcp:send-event -- <event_type> --run <id> --agent <id> [--task <id>] [--data '<json>']` | Kirim webhook MCP bertanda tangan (dev tool TASK_009) |

## Struktur Kode
```
backend/
├── prisma/
│   ├── schema.prisma                 # model = DDL di M1_TASK_001
│   └── migrations/…_init/            # SQL hasil Prisma + SQL manual (CHECK, partial index, tsvector)
├── prisma.config.ts              # membaca ../.env
├── src/
│   ├── main.ts                       # bootstrap: helmet, cookie, CORS, prefix /api/v1, Swagger, Socket.IO Redis adapter
│   ├── app.module.ts                 # registrasi modul + guard global (JWT → rate limit) + filter error
│   ├── config/                       # load .env, validasi env (Zod), AppConfigService
│   ├── database/                     # PrismaService (+ tx helper), seeds/
│   ├── redis/                        # koneksi Redis bersama
│   ├── common/                       # lintas modul
│   │   ├── constants/                # kode error, konstanta domain (role rank, max depth)
│   │   ├── decorators/               # @Public, @CurrentUser, @ClientId, @RateLimit, @ApiZodBody
│   │   ├── exceptions/               # AppException + factory Errors.*
│   │   ├── filters/                  # handler error global → { error: { code, message, details }, request_id }
│   │   ├── guards/                   # JWT, rate limit (Redis), HMAC webhook MCP, service token Agent API
│   │   ├── pipes/                    # ZodPipe (validasi), UuidPipe
│   │   └── types/
│   ├── utils/
│   │   ├── helpers/                  # date (plain date), crypto (HMAC), pagination, text/URL, AfterCommit
│   │   └── logger/                   # konfigurasi pino (request id, redact secret)
│   ├── shared/schemas/               # kontrak bersama: block format, MCP events/tools, schema umum
│   ├── modules/                      # satu folder per fitur: *.controller (routes) → *.service (logika) → Prisma
│   │   ├── auth/                     # register/login/refresh/logout/me, token & password service
│   │   ├── core/                     # AccessService (RBAC + anti-IDOR), ActorService
│   │   ├── workspaces/  agents/  projects/  tasks/  comments/
│   │   ├── activity/  notifications/
│   │   ├── agent-runs/               # MCP client, antrian BullMQ, worker, sweeper timeout
│   │   ├── blocks/  timeline/        # TASK_003
│   │   ├── webhooks/  agent-api/     # MCP → Dashboard
│   │   ├── realtime/                 # Socket.IO gateway + service emit
│   │   └── health/
│   ├── scripts/                      # create-database, send-mcp-event
│   └── generated/prisma/             # hasil `prisma generate` (tidak di-commit)
└── test/unit/                        # unit test logika murni
```
Alur request: **controller** (route + validasi Zod + Swagger) → **service** (cek akses via `AccessService`, aturan bisnis,
transaksi Prisma) → efek setelah commit (`AfterCommit`: emit Socket.IO, enqueue job MCP, notifikasi).

## Catatan Teknis
- **TypeScript 7.0.2 + NestJS 12.3** sudah diverifikasi (keputusan D1). TS 7 tidak lagi menyediakan compiler API JS, sehingga
  `ts-jest`, `ts-node`, Nest CLI dan `typescript-eslint` tidak dipakai: build memakai `tsc`, test memakai Jest + SWC.
- `@nestjs/common` 12 berformat ESM-only; Node 24 memuatnya dari CommonJS secara native, Jest butuh `--experimental-vm-modules`
  (sudah ada di script `npm test`).
- Prisma 7.10.1 (stable). Tag `latest` npm saat ini menunjuk 8.0.0-rc — **jangan** upgrade tanpa pengujian.
- `overrides` di `package.json` hanya untuk peer optional TypeScript milik `@nestjs/swagger` (plugin CLI-nya tidak dipakai).
- Kolom `document_blocks.search_vector` (tsvector GENERATED) tidak dimodelkan di Prisma; jangan pakai `prisma migrate dev`
  untuk membuat migrasi otomatis tanpa memeriksa hasilnya (Prisma akan mencoba menghapus constraint/index manual).
- RBAC diimplementasikan sebagai `AccessService` yang dipanggil di setiap service (bukan decorator per route) agar resource
  yang di-resolve dari body (mis. `project_id` di `/blocks/batch`) ikut tercek.
- Block type yang diterima juga mencakup `toggleListItem`, heading `isToggleable`, header/warna sel tabel, dan placeholder
  kosong untuk `bookmark`/`aiPrompt` (agar dokumen dari editor BlockNote tersimpan utuh).
- Mock MCP Server (TASK_009) belum dibuat; tanpa MCP Server, assign ke agent akan di-retry 5x lalu berstatus `failed`.
  Webhook bisa disimulasikan dengan `npm run mcp:send-event`.

## Status Verifikasi
- 34 unit test lulus (`npm test`).
- Smoke test end-to-end terhadap PostgreSQL nyata (79 skenario): auth + rotasi/reuse refresh token, IDOR & RBAC, CRUD,
  hierarki 3 level & circular, timeline + cascade reschedule, block batch + konflik versi + XSS, komentar & mention,
  webhook (signature, idempotency, run tidak aktif), Agent API, Socket.IO, cascade delete, rate limit.
- UC2 + UC3 penuh dengan MCP server uji: estimasi → dispatch → agent membaca Project Brief → menulis blok → 3 subtask → komentar → `done`.
- MCP mati: dispatch di-retry 5x (±150 detik) lalu run `failed` + notifikasi `agent_task_failed`.
