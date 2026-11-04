# Task: Kontrak Integrasi 1.2 (Schema Bersama & Contract Test)
**ID:** M3_TASK_000
**Status:** Done (4 Nov 2026) — 50 fixture `contracts/intel-1.2/`; Pydantic `mcp/mcp_marketing/schemas/intel.py` & Zod `backend/src/shared/schemas/intel.schema.ts` lulus fixture yang sama (53 test di tiap repo)
**Repo:** `marketingdashboardjtp` + `mcp`
**Dependencies:** —
**Estimasi:** 2 person-days
**Acuan:** [M3_MCP_INTEGRATION.md](M3_MCP_INTEGRATION.md)

## Objective
Mengunci kontrak Dashboard ↔ MCP versi 1.2 dalam bentuk **schema yang bisa dijalankan** di kedua repo dan **fixture bersama**, sehingga perubahan di satu sisi langsung memecahkan test di sisi lain sebelum sampai ke integrasi.

## Pekerjaan

### A. Dashboard
- [ ] `backend/src/shared/schemas/intel.schema.ts` (Zod): `jobSpecSchema` (discriminated union sumber `x|threads|web(scrape|crawl)|trends`), `estimateSchema`, `jobViewSchema`, `agentInfoSchema`, `sourceStatusSchema`, `llmStatusSchema`, envelope `intelEventSchema` + `data` per `event_type`.
- [ ] `mcp.schema.ts`: envelope webhook menjadi union — varian run (Modul 1, tidak berubah) dan varian job (`job_id`, `mcp_job_id`, `sequence`) dipilih dari awalan `event_type`.
- [ ] Konstanta batas (keywords, `max_items`, URL, dll.) diekspor dari satu file dan dipakai oleh Zod & validasi frontend.

### B. MCP
- [ ] `mcp_marketing/schemas/intel.py` (Pydantic v2) setara Zod: batas & default identik.
- [ ] Ekspor JSON Schema (`manage.py export-schemas`) untuk toolset `intel`.

### C. Fixture bersama
- [ ] Folder `contracts/intel-1.2/` di **kedua** repo (isi identik; sumber = repo MCP, dibangkitkan & disalin oleh `python scripts/export_intel_fixtures.py --dashboard <path repo Dashboard>`):
  - `valid/*.json`: spec tiap sumber, job view (completed, partial, failed), semua event `intel.job.*`, agent info, estimate.
  - `invalid/*.json` + `expected_error.json` (field & kode yang diharapkan).
- [ ] Checksum (`SHA256SUMS`) agar CI mendeteksi fixture yang tidak sinkron.

### D. Contract test
- [ ] Dashboard (Jest): semua `valid/*` lolos Zod; semua `invalid/*` gagal di field yang diharapkan.
- [ ] MCP (pytest): idem untuk Pydantic + output tool `intel_*` dan payload outbox yang dibangkitkan dari job contoh divalidasi terhadap fixture.

## Acceptance Criteria
1. Kedua repo menjalankan contract test dari fixture yang sama (checksum cocok).
2. Mengubah satu batas (mis. `max_items` X) hanya di satu repo membuat contract test repo lain gagal.
3. Envelope run Modul 1 tetap lolos (tidak ada regresi test webhook Modul 1).
