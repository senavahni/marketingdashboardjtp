# Task: Backend API, Klien MCP `intel`, Webhook & Real-time
**ID:** M3_TASK_002
**Status:** To Do
**Repo:** `marketingdashboardjtp`
**Dependencies:** M3_TASK_000, M3_TASK_001, M3_TASK_007 (MCP), M3_TASK_008, M3_TASK_009 (sisi MCP)
**Estimasi:** 5 person-days
**Acuan:** [Kontrak 1.2](M3_MCP_INTEGRATION.md), konvensi API [M1_ARCHITECTURE §4](../modul1/M1_ARCHITECTURE.md#4-konvensi-api)

## Objective
Modul NestJS `intel` yang menjadi satu-satunya jembatan Dashboard → MCP toolset `intel`, memproses event `intel.job.*`, memancarkan update real-time, dan menyajikan laporan & data mentah dengan RBAC workspace.

## A. Klien MCP
- [ ] `IntelMcpClient` (di `modules/intel/`) memanggil MCP Streamable HTTP `MCP_SERVER_URL` dengan bearer **`MCP_INTEL_API_KEY`**. Key harus milik klien `dashboard-intel` ber-toolset `intel` saja (bukan `MCP_SERVER_API_KEY` Modul 1); respons `structuredContent` divalidasi dengan Zod kontrak 1.2 sebelum dipakai.
- [ ] Timeout 15 s untuk setiap pemanggilan tool MCP; koneksi gagal/timeout → 502 `MCP_UNAVAILABLE`; error MCP dipetakan sesuai [Kontrak §5](M3_MCP_INTEGRATION.md#5-kode-error).
- [ ] Header `X-Request-Id` diteruskan ke MCP.
- [ ] Cache 60 s untuk `intel_agents_list` & `intel_sources_status` (Redis); `?refresh=true` oleh admin hanya melewati/menginvalidasi cache Dashboard. Field `refresh` MCP saat ini diterima tetapi tidak mengubah pemeriksaan sumber.

## B. REST API (`/api/v1`)

| Method & path | Role min. | Keterangan |
|---|---|---|
| `GET /workspaces/:ws/intel/agents` | viewer | Agent workspace aktif dipetakan via `agents.mcp_agent_key` ke `intel_agents_list`; tampilkan `capabilities`, `route`, `run_token_budget`, `gateway_key.source`/prefix. Profil MCP yang tidak dikenal → `capabilities: []`, `reason: "UNKNOWN_AGENT"` |
| `GET /workspaces/:ws/intel/stage-defaults` · `PUT` | viewer · admin | Default agent per tahap |
| `GET /workspaces/:ws/intel/sources` | viewer | Proxy `intel_sources_status`; status sumber berasal dari `sources[].mode` (`api`, `browser`, `unofficial`, `none`) dan `available` |
| `POST /workspaces/:ws/intel/jobs/estimate` | member | Body Dashboard `{spec:<judul,bahasa,periode,sources>, agents:{collect:<agent_id>, analyze:<agent_id>}}`. Validasi agent aktif dan workspace; bentuk `JobSpec` MCP dengan `stages.collect.agent_key`/`stages.analyze.agent_key` dari `mcp_agent_key`. Panggil `intel_job_estimate` dengan `{workspace_id, spec}` |
| `POST /workspaces/:ws/intel/jobs` | member | Body yang sama + `confirm_cost`, `retry_of_job_id?`. Buat baris lokal lebih dulu; kirim `intel_job_create` dengan `{contract_version:"1.2", dashboard_job_id:<intel_jobs.id>, workspace_id, requested_by:{user_id,name}, spec:<JobSpec MCP>, confirm_cost}`; simpan `mcp_job_id` dari respons. MCP meng-idempotensi create berdasarkan `dashboard_job_id`: bila timeout/hasil tidak pasti, pertahankan baris lokal dan ulangi dengan UUID serta payload yang sama—jangan hapus baris atau membuat job MCP duplikat. `index.enabled` belum didukung pada P0 |
| `POST /intel/jobs/:id/retry-create` | pembuat/admin | Mengulang create MCP dengan UUID Dashboard dan payload tersimpan yang sama setelah respons create tidak pasti |
| `GET /workspaces/:ws/intel/jobs?status=&source=&limit=&cursor=` | viewer | List (pola cursor Modul 1) |
| `GET /intel/jobs/:id` | viewer | Detail + stages + insight (bila ada); backend memanggil `intel_job_get` dengan pasangan `workspace_id`/`mcp_job_id` |
| `POST /intel/jobs/:id/cancel` | pembuat/admin | → `cancelling` → `intel_job_cancel`; respons MCP `{cancelled:false,status}` untuk job terminal diperlakukan sebagai status final, bukan error |
| `DELETE /intel/jobs/:id` | pembuat/admin | Soft delete; job aktif dibatalkan dulu |
| `GET /intel/jobs/:id/items?source=&sentiment=&q=&order_by=&limit=&cursor=` | viewer | Proxy `intel_items`, dengan filter MCP dalam objek `{filter:{source,sentiment,q}}`; batas halaman 1–100, default 50. `RESULT_EXPIRED` → 410 |
| `GET /intel/jobs/:id/items/export.csv?...` | viewer | Streaming CSV: panggil `intel_items` berulang (maksimum limit 100 per halaman, ekspor Dashboard maks 20.000 baris), ikuti `next_cursor`, sertakan `Content-Disposition`, anti CSV-injection (util Modul 2), tanpa memuat seluruh data ke memori |
| `GET /workspaces/:ws/intel/llm-status?range_days=7\|30` | admin | Proxy `intel_llm_status`; tampilkan prefix, sumber/status key dan pemakaian, tidak pernah nilai key |

- [ ] Zod untuk semua body/query; agent harus aktif di workspace yang sama (anti-IDOR), memiliki `mcp_agent_key`, dan kapabilitas sesuai tahap. Panggilan `intel_job_estimate`/`intel_job_create` tetap memvalidasi ulang profil agent di MCP.
- [ ] Error baru di tabel M1_ARCHITECTURE §4: `MCP_UNAVAILABLE` (502), `MCP_ERROR` (502), `UNKNOWN_AGENT`/`AGENT_INACTIVE`/`AGENT_NOT_CAPABLE`/`COST_CONFIRMATION_REQUIRED` (422), `NOT_FOUND` (404), `RESULT_EXPIRED` (410), `FEATURE_DISABLED` (503). Konflik `dashboard_job_id` lintas workspace → 409; status final dari cancel ditangani dari output tool.

## C. Webhook
- [ ] Perluas `POST /api/v1/webhooks/mcp/events`: envelope union (TASK_000). Varian job diteruskan ke `IntelEventService` dalam transaksi:
  - envelope kontrak 1.2: `job_id` = UUID `dashboard_job_id`, `mcp_job_id` = ID MCP; simpan event idempotently berdasarkan `event_id`;
  - korelasikan event dengan `intel_jobs.id = job_id`; bila webhook tiba sebelum respons create, isi `mcp_job_id` dari envelope. Tolak ketidakcocokan `mcp_job_id` yang sudah tersimpan;
  - abaikan `sequence ≤ last_event_sequence` dan balas 200; event untuk job tidak dikenal → 404; event baru setelah job terminal → 409 `JOB_NOT_ACTIVE` sesuai kontrak webhook;
  - transisi status mengikuti [state machine](M3_MCP_INTEGRATION.md#34-state-machine-dashboard--mcp-sama);
  - `intel.job.completed` berisi preview/ringkasan jumlah/biaya saja; setelah commit panggil `intel_job_get` untuk mengambil dan menyimpan hasil lengkap (`intel_insights`, `cost`, `items_handle`, `items_expire_at`). Bila hasil belum terambil, tandai `insight_pending` dan coba ulang oleh sweeper.
- [ ] Sweeper (BullMQ repeatable, 2 menit): job non-terminal tanpa event > 2 menit → `intel_job_get` → sinkronkan.

## D. Real-time & notifikasi
- [ ] Event Socket.IO `intel.job.updated` ke room `workspace:<id>` (payload ringkas: id, status, stages progres, total_items) — reuse gateway Modul 1; throttling 1 emit/detik/job.
- [ ] Notifikasi in-app ke pembuat job saat `completed`/`failed` (reuse modul notifikasi Modul 1).

## E. Test
- [ ] Unit: state machine, mapper error MCP, validasi agent per tahap, CSV streaming.
- [ ] Integration (pola `test:api` Modul 2) memakai **Mock MCP intel** berbasis SDK di `backend/test/support/mock-mcp-intel.ts`; validasi input/output dan event terhadap fixture bersama `contracts/intel-1.2/` dari repo MCP, serta uji HMAC webhook.

## Acceptance Criteria
1. UC-M3-01, 04, 05 berjalan melawan Mock MCP; UC-M3-02/03 melawan MCP nyata (TASK_006). Fixture kontrak 1.2 dari kedua repo lulus.
2. Event duplikat/terlambat tidak mengubah status; event untuk job workspace lain tidak mungkin (job_id dicari global, workspace diambil dari job).
3. Ekspor CSV 5.000 baris < 15 s, memori proses naik < 50 MB.
4. Tidak ada respons API yang memuat key `lgw_...` lengkap atau `MCP_INTEL_API_KEY`.
5. Coverage modul `intel` ≥ 80%.
