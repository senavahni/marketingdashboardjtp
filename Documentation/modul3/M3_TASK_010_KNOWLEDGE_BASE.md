# Task: Simpan Hasil Riset ke Knowledge Base (P1)
**ID:** M3_TASK_010
**Status:** To Do
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
