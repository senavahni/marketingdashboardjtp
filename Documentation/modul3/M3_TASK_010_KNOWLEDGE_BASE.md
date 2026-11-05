# Task: Simpan Hasil Riset ke Knowledge Base (P1)
**ID:** M3_TASK_010
**Status:** Done (5 Nov 2026). MCP: `services/intel/kb_index.py` (koleksi `intel:<workspace_id>`, satu dokumen per item + ringkasan, dedupe `sha256(text)`, embedding batch 64, metadata per chunk), tahap `index` di `IntelPipelineHandler` (event progres, biaya `cost.by_stage`, gagal = tidak fatal → `skipped` + warning `INDEX_FAILED`), estimasi tahap index, tool `intel_job_purge_index`. Dashboard: `agents.index` opsional, baris tahap index, default per tahap `index`, purge saat job dihapus (best-effort), wizard toggle **Simpan ke Knowledge Base** + agent Indeks, badge "Tersimpan di KB (n chunk)". Test: MCP `tests/integration/test_intel.py::test_index_stage_saves_to_kb_scoped_and_purgeable`, Jest `intel-agents.spec.ts`, Vitest `intel.test.ts`, Playwright E2E-M3-08 (stack nyata). Catatan: teks yang sama dengan job sebelumnya di workspace yang sama tidak di-embed ulang dan tetap milik job pertama (purge job kedua tidak menghapusnya)
**Repo:** `mcp` + `marketingdashboardjtp`
**Dependencies:** M3_TASK_007, M3_TASK_008
**Estimasi:** 3 person-days
**Acuan:** [UC-M3-08](M3_USE_CASES.md#uc-m3-08-p1-menyimpan-hasil-ke-knowledge-base), MCP `MCP_SPEC §4.9` (`kb_*`)

## Objective
Hasil job riset bisa dipakai ulang oleh agent Modul 1 (mis. `@Agent_Strategist` menyusun kalender konten berdasarkan percakapan publik) melalui `kb_search`, dan menjadi sumber data visualisasi 3D (TASK_011).

## MCP
- [ ] Tahap `index` di pipeline (`IntelPipelineHandler`): `kb_ingest` ke koleksi `intel:<workspace_id>` (dibuat otomatis via `kb_collection_create`, `workspace_id` terisi), sumber = `items_handle` + `summary_md` sebagai dokumen ringkasan.
- [ ] Metadata per chunk: `{job_id, source, sentiment, created_at, author, url}`; dedupe per `sha256(text)`.
- [ ] Embedding via Gateway `embed-default` memakai key agent tahap `index` (TASK_009); biaya masuk `cost.by_stage`.
- [ ] Event `intel.job.stage.started/progress/completed` untuk `index` (progres = chunk ter-embed / total).
- [ ] Hapus job di Dashboard → event/aksi `intel_job_purge_index(job_id)` (P1.1) menghapus dokumen job dari koleksi.

## Dashboard
- [ ] Wizard langkah 3: toggle **Simpan ke Knowledge Base** + pilih agent tahap *Indeks* (kapabilitas `index`).
- [ ] Detail job: badge "Tersimpan di KB (n chunk)".
- [ ] Task Modul 1: tidak ada perubahan — agent memakai `kb_search` dengan koleksi workspace.

## Acceptance Criteria
1. Setelah job dengan index aktif selesai, `kb_search` dari agent `strategist` pada workspace yang sama menemukan post relevan; workspace lain tidak.
2. Biaya embedding tercatat per agent.
