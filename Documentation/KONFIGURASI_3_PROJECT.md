# Konfigurasi & Kredensial: Dashboard ↔ MCP ↔ LLM Gateway

Panduan singkat menghubungkan tiga project. Dokumen ini **tidak berisi nilai secret**, hanya nama, fungsi, dan cara membuatnya.

## 1. Alur

```
Browser ──JWT──▶ Dashboard (NestJS :3000)
                   │  MCP_SERVER_API_KEY   (toolset pm: agent run Modul 2)
                   │  MCP_INTEL_API_KEY    (toolset intel: Modul 3)
                   ▼
                 MCP (:4100/mcp) + worker
                   │  ▲ webhook bertanda tangan  MCP_WEBHOOK_SECRET
                   │  └─ callback API Dashboard  MCP_SERVICE_TOKEN
                   │  key lgw_ per agent (terenkripsi MCP_SECRET_KEY)
                   │  fallback: LLM_GATEWAY_API_KEY
                   │  rotasi key: LLM_GATEWAY_ADMIN_KEY ──▶ /admin Gateway
                   ▼
                 LLM Gateway (:8000/v1)
                   │  OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY
                   │  RUNTIME_TOKEN ──▶ Local Runtime (model lokal)
                   ▼
                 OpenAI / Anthropic / Gemini
```

Urutan menyalakan: **Gateway → MCP → Dashboard** (`start-project(dashboard-mcp-llmgateway).bat`).

## 2. Login ke console & aplikasi

| Tempat | URL | Login dengan | Cara membuat |
|---|---|---|---|
| Dashboard | `http://localhost:5173` | email + password akun user | akun dibuat admin Dashboard (seed demo memakai `SEED_DEMO_PASSWORD`) |
| Console MCP | `http://127.0.0.1:4100/console` (hanya dari komputer ini) | key klien MCP **admin** (`mcpk_…`) | `scripts\conda-run.bat python scripts\manage.py create-client --name ops-console --admin` (dari folder `mcp`) |
| Console Gateway | `http://127.0.0.1:8000/console` (hanya dari komputer ini) | **admin key** Gateway (`lgw_…`) | `scripts\conda-run.bat python scripts\manage.py create-admin-key --name ops` (dari folder `llm-genai`) |

- Key hanya **tampil sekali** saat dibuat. Simpan di password manager.
- Admin key Gateway tidak bisa dibuat dari console; harus lewat CLI.
- Perintah CLI harus dijalankan dari **root folder project**, bukan dari `scripts\`. Kalau dijalankan dari `scripts\`, `.env` tidak terbaca dan muncul error "DATABASE_URL wajib diisi".

## 3. Kredensial per project

Cara membuat secret acak (≥ 32 karakter):
`python -c "import secrets; print(secrets.token_urlsafe(48))"`

### Dashboard (`marketingdashboardjtp/.env`)

| Variabel | Fungsi | Cara membuat |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | koneksi DB `marketing_dashboard` | role PostgreSQL |
| `REDIS_PASSWORD` | koneksi Redis | konfigurasi Redis |
| `JWT_ACCESS_SECRET` | menandatangani token login user | secret acak |
| `MCP_SERVER_API_KEY` | Dashboard → MCP, toolset `pm` (agent run) | secret acak, **salin ke `.env` MCP** |
| `MCP_INTEL_API_KEY` | Dashboard → MCP, toolset `intel` (Modul 3) | `manage.py create-client --name dashboard-intel --toolsets intel --rpm 300` di MCP |
| `MCP_WEBHOOK_SECRET` | memverifikasi webhook dari MCP | secret acak, **salin ke `.env` MCP** |
| `MCP_WEBHOOK_SECRET_PREVIOUS` | secret lama saat rotasi webhook (opsional) | nilai lama `MCP_WEBHOOK_SECRET` |
| `MCP_SERVICE_TOKEN` | MCP → API Dashboard (callback) | secret acak, **salin ke `.env` MCP** |

### MCP (`mcp/.env`)

| Variabel | Fungsi | Cara membuat |
|---|---|---|
| `DATABASE_URL` / `MIGRATION_DATABASE_URL` | role `mcp_app` (runtime) / `mcp_owner` (migrasi) | `scripts\db-bootstrap.bat marketing_dashboard postgres` |
| `MCP_KEY_PEPPER` | hash key klien `mcpk_` di DB | secret acak |
| `MCP_SECRET_KEY` | enkripsi AES-256-GCM key `lgw_` per agent di DB | `manage.py gateway-keys gen-secret` (32 byte base64) |
| `MCP_SERVER_API_KEY`, `MCP_WEBHOOK_SECRET`, `MCP_SERVICE_TOKEN` | pasangan dari Dashboard | **salin persis** dari `.env` Dashboard |
| `LLM_GATEWAY_API_KEY` | key `lgw_` fallback bila agent belum punya key sendiri | console Gateway → project `marketing-mcp` → buat key |
| key `lgw_` per agent | satu key Gateway per agent (atribusi biaya) | `manage.py gateway-keys provision --agents …`. Disimpan terenkripsi di DB, **tidak** di `.env` |
| `LLM_GATEWAY_ADMIN_KEY` (opsional) | tombol **Rotasi key** di Dashboard (memanggil `/admin` Gateway) | `create-admin-key --name mcp-rotation` di Gateway (admin key **terpisah** dari login console) |
| `X_BEARER_TOKEN`, `THREADS_ACCESS_TOKEN`, `TRENDS_OFFICIAL_API_KEY` (opsional) | sumber data sosial/tren | portal developer masing-masing platform |

### LLM Gateway (`llm-genai/.env`)

| Variabel | Fungsi | Cara membuat |
|---|---|---|
| `DATABASE_URL` | DB `llm_gateway` | `CREATE ROLE llm_gateway …` (lihat README Gateway) |
| `GATEWAY_KEY_PEPPER` | hash semua key `lgw_` (aplikasi & admin) | secret acak |
| `RUNTIME_TOKEN` | Gateway ↔ Local Runtime | secret acak |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | panggilan ke provider | console provider |
| `OPENAI_ADMIN_KEY` / `ANTHROPIC_ADMIN_KEY` (opsional) | **hanya membaca** laporan biaya/usage provider | console provider (admin key org) |

## 4. Aturan pemakaian

### Wajib sama di dua sisi (Dashboard = MCP)
- `MCP_SERVER_API_KEY`
- `MCP_WEBHOOK_SECRET`
- `MCP_SERVICE_TOKEN`

### Wajib berbeda (jangan dipakai untuk fungsi lain)
- Tiga secret di atas **berbeda satu sama lain**. `MCP_KEY_PEPPER` harus berbeda dari ketiganya; MCP menolak start bila sama.
- `MCP_INTEL_API_KEY` ≠ `MCP_SERVER_API_KEY`. Toolset dan rate limit keduanya berbeda.
- `MCP_SECRET_KEY` unik, jangan dipakai ulang sebagai pepper atau token.
- Admin key Gateway untuk `LLM_GATEWAY_ADMIN_KEY` ≠ admin key login console. Pisahkan supaya salah satunya bisa dicabut tanpa mengganggu yang lain.
- Admin key Gateway ≠ key aplikasi `lgw_`. Admin key tidak boleh dipakai untuk `/v1`, dan key aplikasi tidak bisa membuka `/admin`.
- Key klien MCP admin (console) ≠ `MCP_INTEL_API_KEY` ≠ key klien lain (Claude Desktop, Cursor). Buat satu key per klien.
- `OPENAI_API_KEY` dan key provider lain **hanya di Gateway**. Jangan ditaruh di MCP atau Dashboard.
- `JWT_ACCESS_SECRET` hanya di Dashboard.

### Boleh / opsional
- `LLM_GATEWAY_API_KEY` boleh dipakai bersama oleh agent yang belum punya key sendiri (fallback). Atribusi biayanya jadi gabungan.
- `MCP_WEBHOOK_SECRET_PREVIOUS` boleh diisi nilai lama selama masa rotasi.
- `OPENAI_ADMIN_KEY` / `ANTHROPIC_ADMIN_KEY` boleh dikosongkan; hanya laporan biaya provider yang hilang.
- `LLM_GATEWAY_ADMIN_KEY` boleh dikosongkan; tombol Rotasi key akan menampilkan error 409 dengan petunjuk.

### Jangan diganti sembarangan
| Diganti | Akibat |
|---|---|
| `GATEWAY_KEY_PEPPER` | **semua** key `lgw_` (aplikasi + admin) tidak berlaku lagi |
| `MCP_KEY_PEPPER` | semua key klien `mcpk_` tidak berlaku lagi |
| `MCP_SECRET_KEY` | key `lgw_` per agent di DB tidak bisa didekripsi; jalankan ulang `gateway-keys provision` |
| salah satu secret pasangan | Dashboard ↔ MCP gagal (401 / webhook ditolak) sampai kedua sisi disamakan lagi |

## 5. Urutan setup dari nol

1. **Gateway:** isi `.env`, migrasi, `seed`, lalu `create-admin-key --name ops` untuk login console.
2. **Gateway console:** buat project `marketing-mcp` + key aplikasi, lalu isi `LLM_GATEWAY_API_KEY` di MCP.
3. **Dashboard:** buat tiga secret pasangan dan isi `.env` Dashboard.
4. **MCP:** salin tiga secret pasangan, isi `MCP_KEY_PEPPER`, `gateway-keys gen-secret` → `MCP_SECRET_KEY`, `db-bootstrap`, `migrate`, `seed`.
5. **MCP:** `create-client --name dashboard-intel --toolsets intel --rpm 300` → isi `MCP_INTEL_API_KEY` di Dashboard.
6. **MCP:** `create-client --name ops-console --admin` untuk login console MCP.
7. **Opsional:** `gateway-keys provision --agents …` (key per agent), lalu `create-admin-key --name mcp-rotation` di Gateway → `LLM_GATEWAY_ADMIN_KEY` di MCP.
8. Restart ketiganya, lalu verifikasi di folder `backend` Dashboard: `npm run m3:smoke` (cek health, tool `intel_*`, rute Gateway).
