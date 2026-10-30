# Marketing Dashboard — Modul 1: Agentic Project Management

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

Aplikasi memakai **PostgreSQL dan Redis yang sudah ada** (mis. container `postgres_db` di port 5432 dan `redis_secure` di
port 6379) — keduanya tidak dijalankan oleh project ini.

```bash
cp .env.example .env
```
Isi di `.env`:

| Variabel | Keterangan |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD` (+ `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`) | Koneksi PostgreSQL. Database `marketing_dashboard` dibuat otomatis jika belum ada |
| `REDIS_USERNAME`, `REDIS_PASSWORD` (+ `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`) | Koneksi Redis (user ACL `redis_secure`). Kosongkan user/password jika Redis tanpa auth |
| `JWT_ACCESS_SECRET`, `MCP_SERVER_API_KEY`, `MCP_WEBHOOK_SECRET`, `MCP_SERVICE_TOKEN` | Secret acak ≥ 32 karakter: `openssl rand -base64 48` |

> Alternatif: isi `DATABASE_URL` / `REDIS_URL` langsung (khusus mode non-Docker; di Docker URL dibangun dari variabel terpisah).

---

## 2. Menjalankan dengan Docker

Prasyarat: Docker + Docker Compose, PostgreSQL & Redis sudah berjalan di mesin host.

```bash
docker compose up -d --build
```

```
Browser ──► :8088  nginx (frontend)  ──/api, /socket.io, /health──►  backend:3000 (jaringan internal docker)
                                                                        │
                                                    host.docker.internal ├──► PostgreSQL (POSTGRES_PORT)
                                                                        └──► Redis (REDIS_PORT)
```
- Hanya **frontend (nginx)** yang diekspos: http://localhost:8088 (`DOCKER_WEB_PORT`). Backend tidak membuka port ke host.
- Backend menjangkau Postgres & Redis di host lewat `host.docker.internal` (atur dengan `DOCKER_POSTGRES_HOST` / `DOCKER_REDIS_HOST`);
  port & kredensial tetap dari `POSTGRES_*` / `REDIS_*`.
- Saat start, backend otomatis **membuat database (jika belum ada) → migrasi → menjalankan API**.

| Alamat | Keterangan |
|---|---|
| http://localhost:8088 | Aplikasi web |
| http://localhost:8088/health | Health check (status DB & Redis) |
| http://localhost:8088/api/docs | Swagger (jika `SWAGGER_ENABLED=true`) |

Isi data demo (sekali):
```bash
docker compose exec -e NODE_ENV=development backend npm run db:seed
```
Perintah lain:
```bash
docker compose logs -f backend      # log backend
docker compose up -d --build        # rebuild setelah kode berubah
docker compose down                 # hentikan
```
File Docker ada di root: [`Dockerfile.backend`](Dockerfile.backend), [`Dockerfile.frontend`](Dockerfile.frontend), [`nginx.conf`](nginx.conf), [`docker-compose.yml`](docker-compose.yml).

---

## 3. Menjalankan tanpa Docker (development)

Prasyarat: **Node.js 24+**, PostgreSQL & Redis sudah berjalan (sesuai `.env`, host `localhost`).

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
`frontend/dist` dengan web server yang mem-proxy `/api`, `/socket.io`, `/health` ke backend (contoh: [`nginx.conf`](nginx.conf), ganti
`backend:3000` dengan alamat backend).

---

## 4. Akun demo (hasil seed)

Password semua akun = `SEED_DEMO_PASSWORD` (default `Demo12345!`).

| Email | Peran di workspace "Marketing Demo" |
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
├── .env / .env.example      # satu konfigurasi untuk semua (Postgres, Redis, secret, frontend, docker)
├── .gitignore / .dockerignore
├── .prettierrc
├── docker-compose.yml       # backend (internal) + frontend nginx (satu-satunya port terekspos)
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf               # sajikan SPA + proxy /api, /socket.io, /health ke backend
├── backend/                 # API (lihat backend/README.md)
├── frontend/                # Web app (lihat frontend/README.md)
└── Documentation/modul1/    # spesifikasi
```

## 7. Pengujian

```bash
cd backend && npm test       # unit test backend
cd frontend && npm test      # unit test frontend
```
