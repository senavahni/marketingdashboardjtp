# Task: QA, Contract Test, E2E Stack Nyata & Rilis
**ID:** M3_TASK_006
**Status:** Done kecuali uji X 5.000 item (ditunda: butuh profil browser login X — kini bisa lewat Sumber & Koneksi → Login X). Diverifikasi 6 Nov 2026.

**Ringkasan hasil**
- **Lapisan test:** contract, unit, dan integrasi hijau.
  - MCP: 536 lulus.
  - Dashboard: Jest ±230 dan Vitest 91 lulus.
- **E2E stack nyata:** `intel.stack.e2e.ts` 9/9 lulus (Web, OpenAI sungguhan). E2E stack tidak memakai Mock MCP. E2E deterministik melawan Mock MCP (`intel.e2e.ts`) tidak dibuat, karena suite stack sudah menutup UC-M3-01..07 dan Fase 013/014.
- **Smoke check rilis:** `npm run m3:smoke` (backend) memeriksa tiga hal:
  1. Dashboard `/health`.
  2. MCP dengan `MCP_INTEL_API_KEY` hanya mengekspos tool `intel_*`.
  3. Route LLM Gateway tersedia.

  Hasil: 3/3 OK. Di mode dev, `dist` dikompilasi oleh `nest --watch`; di produksi jalankan `npm run build` lebih dulu.
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
- [x] **Worker hilang:** worker MCP mati di tengah `collecting` → `WORKER_LOST`. Diuji `test_jobs.py` (reaper) + `test_worker_lost_surfaces_on_intel_job` (rekonsiliasi job intel).
- [x] **LLM mati saat `analyzing`:** → `LLM_UNAVAILABLE`, data koleksi tetap tersedia.
  - **Diperbaiki 6 Nov:** sebelumnya item koleksi hilang bila LLM mati saat klasifikasi sentimen. Sekarang item disimpan tanpa label sebagai hasil parsial.
  - Uji: `test_llm_down_during_sentiment_keeps_collected_items`.
- [x] **Key agent dicabut:** → `LLM_KEY_INVALID` (`test_gateway_key_rejected_maps_to_llm_key_invalid`).
- [x] **Kuota project Gateway habis:** → `LLM_QUOTA_EXCEEDED`.
  - Dipetakan unit (`test_intel.py`).
  - Terjadi nyata 5 Nov (batas $0,50/hari). Pesan UI misi kini "Kuota LLM Gateway habis…" (`intel-errors.spec.ts`).
- [x] **Budget token kecil:** → `BUDGET_EXCEEDED` dengan hasil parsial (pemetaan unit + jalur hasil parsial pipeline).
- [x] **Webhook palsu / ganda:**
  - Tanpa atau beda HMAC → 401 (`crypto.util.spec.ts`).
  - Event duplikat & `sequence` mundur diabaikan (`intel-event.service.spec.ts`).
- [x] **Akses lintas workspace:** job workspace lain → 404/`NOT_FOUND` (MCP `test_intel.py`; Dashboard `assertWorkspace`).
- [x] **MCP mati:** estimasi wizard → **502 `MCP_UNAVAILABLE`** "Layanan MCP tidak tersedia", sedangkan projects & daftar job tetap 200. Diuji stack nyata 6 Nov (server MCP dihentikan sementara).
- [ ] **Data besar (job X 5.000 item):** tabel raw data mulus, CSV < 15 s — **ditunda** (menunggu login X).

## D. Keamanan
- [x] **Pemindaian secret:** tidak ada `lgw_`, `sk-`, atau `OPENAI_API_KEY` dalam source Dashboard. Diuji `backend/test/unit/secret-scan.spec.ts`, yang jalan di setiap `jest`. File ter-track juga sudah dipindai manual 6 Nov, dan `.env` tidak ter-track.
- [x] **Redaksi key di respons:** key `lgw_` lengkap disensor di respons `intel` (`redactGatewayKeys`, `intel-agents.spec.ts` llmStatus).
- [x] **SSRF:** target berikut ditolak skema Dashboard (`intel-webhook.schema.spec.ts`):
  - `127.0.0.1`, `169.254.169.254`, `localhost`, `10.x`, `192.168.x`, `[::1]`;
  - URL berkredensial, `file:`, `javascript:`.

  MCP mengecek ulang setelah redirect (`ssrf_denied`).
- [x] **XSS:** teks post/ringkasan dirender lewat `safe-markdown` (tes anti-XSS di `intel.test.ts`).

## E. Deployment / konfigurasi
- [x] **Variabel lingkungan:** `.env.example` Dashboard memuat `MCP_INTEL_API_KEY` & `MCP_WEBHOOK_SECRET`; MCP memuat `MCP_SECRET_KEY`. Provisioning key ada di TASK_009 / docs MCP.
- [x] **Cek pasca-start:** `start-project(...).bat` tidak diubah. Langkah cek setelah start diganti satu perintah, `cd backend && npm run m3:smoke`, yang mencakup `tools/list` intel-only dan route Gateway lewat MCP memakai key `system`.
- [x] **Retensi data mentah:** ditangani MCP (`SOCIAL_RETENTION_DAYS=180`, `RAW_RETENTION_DAYS=14`); Dashboard menampilkan `items_expire_at`.
- [x] **Migrasi:** setelah pull, jalankan `npx prisma migrate deploy` (backend). Migrasi Modul 3: `m3_intel`, `m3_missions`, `m3_mission_execution`, `m3_mission_budget`.

## Acceptance Criteria
1. Semua lapisan test hijau; E2E stack nyata lulus minimal sekali dengan Web + X.
2. Semua skenario kegagalan §C menghasilkan pesan yang bisa ditindaklanjuti di UI.
3. Status implementasi di [README §7](README.md#7-status-implementasi) diperbarui.
