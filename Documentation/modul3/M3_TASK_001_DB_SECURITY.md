# Task: Database Dashboard & Keamanan Modul 3
**ID:** M3_TASK_001
**Status:** To Do
**Repo:** `marketingdashboardjtp`
**Dependencies:** M3_TASK_000
**Estimasi:** 2 person-days
**Acuan:** [PRD §3–5](M3_PRD.md), [Kontrak §2.4, §3.4](M3_MCP_INTEGRATION.md)

## Objective
Menyimpan **metadata job, tahap, dan ringkasan insight** di DB Dashboard dengan scoping workspace. Data mentah tetap di MCP (README K4); secret provider dan key Gateway **tidak** disimpan di Dashboard (K5, K7).

Kontrak MCP yang dipakai adalah `intel` 1.2. ID job lokal Dashboard (`intel_jobs.id`, UUID) dikirim sebagai `dashboard_job_id`; `mcp_job_id` adalah ID terpisah dari MCP (`j_<10 karakter>`). Pada webhook, `job_id` menunjuk UUID Dashboard dan `mcp_job_id` menunjuk ID MCP.

## A. Skema (migrasi baru `<timestamp>_m3_intel`)

```sql
CREATE TYPE intel_job_status   AS ENUM ('queued','collecting','analyzing','indexing','completed','failed','cancelling','cancelled');
CREATE TYPE intel_stage        AS ENUM ('collect','analyze','index');
CREATE TYPE intel_stage_status AS ENUM ('pending','running','completed','skipped','failed','cancelled');

CREATE TABLE intel_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id),
  title               VARCHAR(150) NOT NULL,
  status              intel_job_status NOT NULL DEFAULT 'queued',
  spec                JSONB NOT NULL,              -- JobSpec tervalidasi (TASK_000), tanpa secret
  sources             TEXT[] NOT NULL,             -- ['x','trends'] untuk filter cepat
  estimate            JSONB,
  mcp_job_id          VARCHAR(32) UNIQUE,         -- j_<10 karakter>; NULL sampai create MCP terkonfirmasi
  last_event_sequence INTEGER NOT NULL DEFAULT 0,
  total_items         INTEGER,
  items_handle        VARCHAR(32),
  items_expire_at     TIMESTAMPTZ(6),
  cost                JSONB,                       -- {llm_tokens, usd_llm, external_units, usd_external, by_stage[]}
  error               JSONB,                       -- {code, message, retryable, stage}
  retry_of_job_id     UUID REFERENCES intel_jobs(id),
  created_by          UUID REFERENCES users(id),
  started_at          TIMESTAMPTZ(6),
  finished_at         TIMESTAMPTZ(6),
  created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ(6)
);
CREATE INDEX intel_jobs_ws_idx ON intel_jobs (workspace_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX intel_jobs_active_idx ON intel_jobs (status, updated_at) WHERE status IN ('queued','collecting','analyzing','indexing','cancelling');

CREATE TABLE intel_job_stages (
  job_id         UUID NOT NULL REFERENCES intel_jobs(id) ON DELETE CASCADE,
  stage          intel_stage NOT NULL,
  agent_id       UUID NOT NULL REFERENCES agents(id),
  agent_key      VARCHAR(100) NOT NULL,          -- snapshot mcp_agent_key saat job dibuat
  status         intel_stage_status NOT NULL DEFAULT 'pending',
  progress_done  INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER,
  stats          JSONB,
  error          JSONB,
  started_at     TIMESTAMPTZ(6),
  finished_at    TIMESTAMPTZ(6),
  PRIMARY KEY (job_id, stage)
);

CREATE TABLE intel_insights (
  job_id          UUID PRIMARY KEY REFERENCES intel_jobs(id) ON DELETE CASCADE,
  summary_md      TEXT,
  recommendations JSONB NOT NULL DEFAULT '[]',
  sentiment       JSONB,          -- distribution, net_sentiment, by_day, aspects, examples
  trends          JSONB,          -- topics, hashtags, authors
  volume_by_day   JSONB,
  google_trends   JSONB,
  partial         BOOLEAN NOT NULL DEFAULT false,
  warnings        JSONB NOT NULL DEFAULT '[]',
  generated_at    TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Default agent per tahap per workspace (diatur admin, TASK_008)
CREATE TABLE intel_stage_defaults (
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  stage        intel_stage NOT NULL,
  agent_id     UUID NOT NULL REFERENCES agents(id),
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, stage)
);
```
Bagian 2 manual: `CHECK (cardinality(sources) BETWEEN 1 AND 4)`, `CHECK (last_event_sequence >= 0)`, `CHECK (progress_done >= 0)`.

- [ ] Model Prisma + migrasi (pola Modul 2: bagian 1 `prisma migrate diff`, bagian 2 manual). `intel_jobs.id` harus UUID yang sama dengan `dashboard_job_id` yang dikirim ke MCP.
- [ ] Tabel `mcp_webhook_events` Modul 1 dipakai ulang untuk idempotensi `event_id` (tambah kolom `job_id UUID NULL`; `run_id` jadi nullable bila belum).
- [ ] Simpan `mcp_job_id` dan `items_handle` terpisah; `items_handle` (`h_<10 karakter>`) dan `items_expire_at` berasal dari `intel_job_get.result`, bukan event `intel.job.completed`.
- [ ] **Tidak** ada tabel `scraped_raw_data` dan `credentials` (lihat [Review §3.4](M3_REVIEW.md)).

## B. Keamanan
- [ ] `spec` disimpan setelah validasi Zod; teks bebas (judul, keyword, aspek) di-escape di UI & ekspor.
- [ ] URL hanya `http/https`, ≤ 2.048 karakter; host privat ditolak lebih awal di Dashboard (pemeriksaan SSRF final tetap di MCP).
- [ ] Env `MCP_INTEL_API_KEY` adalah key klien MCP `dashboard-intel` dengan toolset `intel` saja (`mcpk_<prefix8>_<secret43>`, RPM 300); validasi saat start. Jangan gunakan ulang `MCP_SERVER_API_KEY` milik toolset `pm`. Bila key tidak tersedia, Modul 3 nonaktif (menu disembunyikan, API 503 `FEATURE_DISABLED`); dokumentasikan di `.env.example` & M1_ARCHITECTURE §9. Key lengkap ditampilkan MCP hanya saat provisioning.
- [ ] Log tidak pernah mencetak `MCP_INTEL_API_KEY` maupun isi `Authorization`.
- [ ] Seed: agent `Agent_Researcher` (`mcp_agent_key = researcher`) dan `Agent_Analyst` (`mcp_agent_key = analyst`) + `intel_stage_defaults` workspace demo (collect → Researcher, analyze → Analyst). Untuk P0, hanya tahap `collect` dan `analyze` yang dapat dijalankan; jangan aktifkan `index` sebelum didukung pipeline MCP.

## Acceptance Criteria
1. Migrasi jalan dari nol dan di atas DB Modul 1/2 yang ada tanpa mengubah data lama.
2. Constraint menolak `sources` kosong / > 4.
3. Tidak ada kolom yang menyimpan secret provider atau key `lgw_...` (dicek reviewer + grep CI `lgw_|sk-`).
4. `dashboard_job_id` stabil dan unik per job Dashboard; retry MCP untuk create harus menggunakan UUID yang sama.
5. Job dengan `stages.index.enabled=true` ditolak MCP sebagai `VALIDATION_ERROR`; UI P0 tidak menawarkan tahap index.
