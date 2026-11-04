# Task: QA, Contract Test, E2E Stack Nyata & Rilis
**ID:** M3_TASK_006
**Status:** To Do
**Repo:** semua (`marketingdashboardjtp`, `mcp`, `llm-genai`)
**Dependencies:** M3_TASK_000 – 005, 007 – 009
**Estimasi:** 3 person-days
**Acuan:** [Use Cases](M3_USE_CASES.md), [Kontrak 1.2](M3_MCP_INTEGRATION.md)

## Objective
Membuktikan Modul 3 berjalan end-to-end di stack nyata (Dashboard + MCP + LLM Gateway dengan OpenAI), tahan terhadap kegagalan sumber/LLM, dan aman.

## A. Lapisan test

| Lapisan | Lokasi | Isi |
|---|---|---|
| Contract | Dashboard Jest + MCP pytest | Fixture `contracts/intel-1.2` (TASK_000) |
| Unit | kedua repo | State machine, mapper error, validasi, kalkulasi biaya, pemilihan key Gateway |
| Integration Dashboard | `backend/test/integration/intel.api.spec.ts` | API + webhook melawan Mock MCP intel |
| Integration MCP | `mcp/tests/integration/test_intel_*.py` | Pipeline dengan collector & Gateway di-mock (respx), outbox urut per job |
| E2E UI | `frontend/e2e/intel.e2e.ts` | UC-M3-01, 04, 05, 06 melawan Mock MCP (deterministik, jalan di CI) |
| **E2E stack nyata** | `frontend/e2e/intel.stack.e2e.ts` (manual / nightly) | UC-M3-01 → 04 dengan `start-project(...).bat --no-runtime`, OpenAI sungguhan, sumber **Web** (deterministik) + **X** (bila browser profile login) |

## B. Skenario E2E

| ID | Skenario | Cek utama |
|---|---|---|
| E2E-M3-01 | Buat job via wizard (agent default) | Estimasi tampil; job `queued` → `collecting` tanpa refresh |
| E2E-M3-02 | Tahap kumpulkan selesai | Progres naik; statistik tampil |
| E2E-M3-03 | Tahap analisis | Distribusi sentimen + ringkasan; biaya per agent tercatat; header `X-Caller-Agent=analyst` terlihat di Gateway `/admin/requests` |
| E2E-M3-04 | Laporan & raw data | Filter negatif + CSV sesuai filter |
| E2E-M3-05 | Batal & ulangi | `cancelled`; job baru dengan `retry_of_job_id` |
| E2E-M3-06 | AI & Gateway (admin) | Prefix key per agent, sumber key, pemakaian; member tidak bisa akses |
| E2E-M3-07 | Viewer | Bisa lihat & ekspor, tidak bisa buat/batal |

## C. Skenario kegagalan (wajib lulus)
- [ ] Worker MCP dimatikan di tengah `collecting` → `WORKER_LOST` → UI **Gagal** + **Ulangi**.
- [ ] LLM Gateway dimatikan saat `analyzing` → `LLM_UNAVAILABLE`, data koleksi tetap tersedia di tab Data mentah.
- [ ] Key Gateway agent `analyst` dicabut (Gateway Admin API) → `LLM_KEY_INVALID`; halaman AI & Gateway menandai key.
- [ ] Quota project Gateway diset sangat kecil → `LLM_QUOTA_EXCEEDED`.
- [ ] Budget token agent diset kecil → `BUDGET_EXCEEDED` dengan hasil parsial.
- [ ] Webhook palsu (tanpa/beda HMAC) → 401; event duplikat & `sequence` mundur diabaikan.
- [ ] Job workspace lain via API Dashboard → 404; `intel_job_get` dengan `workspace_id` lain langsung ke MCP → `NOT_FOUND`.
- [ ] MCP mati → wizard tidak bisa estimasi (502), modul lain Dashboard tetap jalan.
- [ ] Data besar: job X 5.000 item → tabel raw data mulus, CSV < 15 s.

## D. Keamanan
- [ ] Grep CI di repo Dashboard: tidak ada `lgw_`, `sk-`, `OPENAI_API_KEY` (selain dokumen).
- [ ] Respons semua endpoint `intel` dipindai: tidak ada key lengkap.
- [ ] Penetration ringan: SSRF (`http://127.0.0.1`, `169.254.169.254`) ditolak Dashboard & MCP; XSS di teks post/ringkasan tidak tereksekusi.

## E. Deployment / konfigurasi
- [ ] `.env.example` Dashboard: `MCP_INTEL_API_KEY`. MCP: `MCP_SECRET_KEY`. Dokumentasi provisioning key (TASK_009).
- [ ] `start-project(...).bat` tidak perlu diubah (port sama); tambahkan langkah cek di README `projects/`: `GET :8000/v1/models` dengan key `system`, `tools/list` MCP dengan `MCP_INTEL_API_KEY` hanya berisi `intel_*`.
- [ ] Retensi data mentah ditangani MCP (`SOCIAL_RETENTION_DAYS`, `RAW_RETENTION_DAYS`); Dashboard hanya menampilkan `items_expire_at`.

## Acceptance Criteria
1. Semua lapisan test hijau; E2E stack nyata lulus minimal sekali dengan Web + X.
2. Semua skenario kegagalan §C menghasilkan pesan yang bisa ditindaklanjuti di UI.
3. Status implementasi di [README §7](README.md#7-status-implementasi) diperbarui.
