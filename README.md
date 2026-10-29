# Matrika Dashboard Marketing — Modul 1: Agentic Project Management

Ruang kerja proyek ala **Notion** (halaman, block editor, database view Tabel/Board/Timeline, side peek) yang
menjadikan **AI Agent** sebagai anggota tim. Agent dijalankan oleh Custom MCP Server (Project 2).

| Folder | Isi |
|---|---|
| [`backend/`](backend/README.md) | NestJS + Prisma + PostgreSQL + Redis (REST API, Socket.IO, webhook & Agent API untuk MCP) |
| [`frontend/`](frontend/README.md) | React + Vite + BlockNote (UI ala Notion) |
| [`Documentation/modul1/`](Documentation/modul1/README.md) | PRD, use case, arsitektur, kontrak MCP, task |

Konfigurasi **satu file**: `.env` di root (dipakai backend, frontend, dan docker compose). Template: [`.env.example`](.env.example).

---

## 1. Persiapan (sekali)

```bash
cp .env.example .env
```
Isi minimal di `.env`:

| Variabel | Keterangan |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | Kredensial PostgreSQL (atau isi `DATABASE_URL`) |
| `JWT_ACCESS_SECRET`, `MCP_SERVER_API_KEY`, `MCP_WEBHOOK_SECRET`, `MCP_SERVICE_TOKEN` | Secret acak ≥ 32 karakter: `openssl rand -base64 48` |

Database `matrika_dashboard` dibuat otomatis jika belum ada.

---

## 2. Menjalankan dengan Docker (paling mudah)

Prasyarat: Docker + Docker Compose.

```bash
docker compose up -d --build
```
| Layanan | Alamat |
|---|---|
| Aplikasi web (nginx: frontend + proxy API) | http://localhost:8088 (`DOCKER_WEB_PORT`) |
| Health check | http://localhost:8088/health |
| Swagger API | http://localhost:8088/api/docs (jika `SWAGGER_ENABLED=true`) |
| Redis | localhost:6380 |

- Container backend menjalankan **create database → migrasi → start** otomatis.
- Secara default backend memakai **PostgreSQL di mesin host** (mis. container `postgres_db` di port 5432) lewat `host.docker.internal`.
- Ingin PostgreSQL di dalam compose? Set `DOCKER_POSTGRES_HOST=postgres` di `.env`, lalu `docker compose --profile with-db up -d --build`.

Isi data demo (sekali):
```bash
docker compose exec -e NODE_ENV=development backend npm run db:seed
```

Perintah lain:
```bash
docker compose logs -f backend      # lihat log
docker compose down                 # hentikan (data Redis tetap di volume)
docker compose up -d --build        # rebuild setelah kode berubah
```

---

## 3. Menjalankan tanpa Docker (mode development)

Prasyarat: **Node.js 24+**, PostgreSQL 16+, Redis 7 (boleh pakai `docker compose up -d redis` → port 6380).

```bash
# Terminal 1 — backend (http://localhost:3000)
cd backend
npm install            # sekaligus prisma generate
npm run db:setup       # build → buat database → migrasi → seed demo
npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```
Buka **http://localhost:5173**. Vite mem-proxy `/api` dan `/socket.io` ke backend sehingga browser hanya bicara ke satu origin
(cookie refresh token tetap aman `SameSite=Lax`).

Build produksi tanpa Docker: `cd backend && npm run build && npm run start:prod`, lalu `cd frontend && npm run build` dan sajikan
`frontend/dist` dengan web server yang mem-proxy `/api`, `/socket.io`, `/health` ke backend (contoh: [`frontend/nginx.conf`](frontend/nginx.conf)).

---

## 4. Akun demo (hasil seed)

Password semua akun = `SEED_DEMO_PASSWORD` (default `Demo12345!`).

| Email | Peran di workspace "Matrika Demo" |
|---|---|
| `owner@demo.local` | Owner |
| `manager@demo.local` | Admin |
| `member@demo.local` | Member |
| `viewer@demo.local` | Viewer (hanya baca) |
| `outsider@demo.local` | Bukan anggota (uji hak akses) |

Seed juga membuat project **🚀 Q4 Product Launch** (task, subtask, milestone, Project Brief) dan agent `Agent_Strategist`, `Agent_Researcher`.

---

## 5. Cara pakai singkat (ala Notion)

| Aksi | Cara |
|---|---|
| Buat proyek | Sidebar → **+ Proyek baru** |
| Ganti tampilan | Tab **Brief · Tabel · Board · Timeline** di bawah judul proyek |
| Buka task | Klik judul → terbuka sebagai **side peek** di kanan (Esc untuk menutup, ⤢ untuk halaman penuh) |
| Ubah properti | Klik sel Status / Assignee / Tanggal / Prioritas / Tag |
| Tulis dokumen | Ketik di editor; **/** untuk memilih blok (heading, checklist, toggle, tabel, kode, gambar URL, embed link, divider), **@** untuk mention orang/agent. Tersimpan otomatis |
| Delegasi ke AI | Pilih agent di **Assignee** (section *AI Agents*) atau mention `@Agent_Strategist` di komentar |
| Jadwal | Timeline: geser bar untuk memindah, tarik tepi untuk mengubah durasi, panah ←/→ untuk keyboard |
| Anggota & agent | Sidebar → **Pengaturan** |

> Fitur agent membutuhkan MCP Server (`MCP_SERVER_URL`). Tanpa MCP Server, task yang di-assign ke agent akan dicoba ulang 5x lalu berstatus **Gagal** (bisa *Coba lagi*). Event agent bisa disimulasikan: `cd backend && npm run mcp:send-event -- --help`.

---

## 6. Struktur repository

```
.
├── .env / .env.example      # satu konfigurasi untuk semua
├── .gitignore / .dockerignore
├── .prettierrc
├── docker-compose.yml       # redis, backend, frontend (+ postgres opsional)
├── backend/                 # API (lihat backend/README.md)
├── frontend/                # Web app (lihat frontend/README.md)
└── Documentation/modul1/    # spesifikasi
```

## 7. Pengujian

```bash
cd backend && npm test       # unit test backend
cd frontend && npm test      # unit test frontend
```
