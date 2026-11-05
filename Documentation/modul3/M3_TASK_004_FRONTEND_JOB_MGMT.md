# Task: Frontend — Daftar Job, Wizard & Status Real-time
**ID:** M3_TASK_004
**Status:** Done (5 Nov 2026) — implementasi & Vitest (`pages/Intel*.tsx`, `components/intel/`, `hooks/intel-queries.ts`, `lib/intel-wizard.ts`, `lib/intel-format.ts`; endpoint `GET /intel/jobs/:id/events` untuk tab Log). Playwright dijalankan **melawan stack nyata** (Mock MCP intel belum ada): `frontend/e2e/intel.stack.e2e.ts` E2E-M3-01 (wizard), 02/03 (progres tanpa refresh), 05 (batal & ulangi), 07 (viewer). Perbaikan: `toMcpSpec` meneruskan `aspects` ke `jobSpecSchema` strict → estimasi/buat job selalu 500 (unit test di `intel-agents.spec.ts`)
**Repo:** `marketingdashboardjtp`
**Dependencies:** M3_TASK_002, M3_TASK_003
**Estimasi:** 4 person-days
**Acuan:** [TASK_003 §B.1–B.3, B.6](M3_TASK_003_UI_UX.md), pola Modul 2 (lazy route, data layer TanStack Query)

## Objective
Membangun halaman daftar job, wizard 4 langkah dengan **pemilihan agent** dan **estimasi biaya**, detail job dengan timeline tahap, halaman Sumber & Koneksi, dan pembaruan status real-time.

## Implementasi
- [ ] Route lazy `/w/:ws/intel`, `/w/:ws/intel/:jobId`, `/w/:ws/intel/sources` + menu sidebar **Riset & Insight** (disembunyikan bila API mengembalikan `FEATURE_DISABLED`).
- [ ] Data layer `hooks/intel-queries.ts`: jobs (infinite), job detail, agents, stage-defaults, sources, estimate (mutation), create, cancel, delete; tipe dari skema TASK_000 (disalin ke `lib/intel-types.ts`).
- [ ] **Daftar job**: tabel pola Modul 2 (bukan TanStack Table), badge status + ikon, progres tahap aktif, agent per tahap, biaya; filter status/sumber; empty state.
- [ ] **Wizard** (`components/intel/JobWizard.tsx`):
  - Validasi client memakai konstanta batas yang sama dengan Zod backend (keywords, `max_items`, URL http/https, rentang ≤ 366 hari).
  - Langkah 3 memakai `GET intel/agents` + `stage-defaults`; agent tanpa kapabilitas → opsi nonaktif dengan alasan; bila tidak ada agent mampu → pesan + tautan Settings → Agents.
  - Langkah 4 memanggil `estimate` setiap kali spec/agent berubah (debounce 500 ms, batalkan request lama); tampilkan per tahap & per sumber; checkbox konfirmasi wajib bila `requires_confirmation`.
  - Error 422 dari create (agent berubah di MCP) → kembali ke langkah 3 dengan pesan.
  - Mode **Ulangi**: wizard terisi dari `spec` + agent job lama, mengirim `retry_of_job_id`.
- [ ] **Real-time**: listener Socket.IO `intel.job.updated` (reuse `lib/realtime.ts`) memperbarui cache list & detail; saat reconnect → `invalidateQueries`; polling 15 s **hanya** bila socket terputus > 30 s.
- [ ] **Detail job**: header + aksi sesuai state (Batalkan: `queued|collecting|analyzing|indexing`; Ulangi: `failed|cancelled|completed`; Hapus: pembuat/admin), **timeline tahap 2D** (avatar agent, progres, durasi, biaya per tahap), tab Log (event berurutan dari detail API).
- [ ] **Sumber & Koneksi**: kartu per sumber & route LLM, tombol Cek ulang (`?refresh=true`, admin).
- [ ] Konfirmasi batal/hapus memakai dialog (bukan `confirm()` native) dengan judul job.

## Test
- [ ] Vitest: validasi wizard, pemetaan kapabilitas → opsi agent, reducer update real-time, aturan tombol per status.
- [ ] Playwright (melawan Mock MCP TASK_002): buat job, progres berubah tanpa refresh, batalkan, ulangi.

## Acceptance Criteria
1. UC-M3-01 dan UC-M3-05 lulus E2E.
2. Status & progres berubah < 2 detik setelah event diterima backend, tanpa refresh.
3. Agent yang tidak mampu tidak bisa dipilih; estimasi selalu sesuai pilihan terakhir (tidak ada race).
4. Bundle awal tidak membesar (semua halaman Modul 3 lazy).
