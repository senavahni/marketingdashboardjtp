# Kontrak 1.3 — fixture bersama Dashboard ↔ MCP

Aditif terhadap `intel-1.2` (tool & event 1.2 tidak berubah). Task: DSH-V1-00 / MCP-V1-00.

| Bagian | Sumber Zod (Dashboard) |
|---|---|
| Job kind, parameter per kind, `llm_assist`, `budget_usd`, status `awaiting_review`/`paused`, review & resume, event, pagination, error | `backend/src/shared/schemas/intel-1.3.schema.ts` |
| Toolset baca `mi_*`, `ci_*`, `opp_*`, `ct_*`, `kn_*`, `data_export`, respons `POST /uploads` | `backend/src/shared/schemas/intel-1.3-tools.schema.ts` |
| Import & Contact Finder: `ci_upload_profile`, `ci_import_batches/batch_get/rows/row_decide/rollback`, `cf_targets`, `cf_target_update` (DSH-V1-06 ↔ MCP-V1-08) | `backend/src/shared/schemas/intel-1.3-import.schema.ts` |
| Knowledge: `kn_search`, `kn_cards`, `kn_card_decide/update`, `kn_doctrine_get/decide`, `pb_list/get/save/run`, `kg_search`, `kg_neighbors` (DSH-V1-09 ↔ MCP-V1-11..13) | `backend/src/shared/schemas/intel-1.3-knowledge.schema.ts` |
| Kapabilitas agent 1.3 (`analyze_product`, `discover`, `enrich`, `import_map`, `find_contacts`, `extract_knowledge`, `strategize`, `create_content`) diterima `intel_agents_list` | `backend/src/shared/schemas/intel.schema.ts` (`CAPABILITIES_13`) |

**Status:** draf Dashboard (9 Nov 2026). Fixture dibangkitkan dari `backend/src/scripts/export-contract-13-fixtures.ts`
(`npm run contract:fixtures`). Repo MCP menyalin folder ini apa adanya, menulis model Pydantic padanannya, dan
menjalankan fixture yang sama di pytest. Perubahan kontrak = ubah generator → bangkitkan ulang → salin ke MCP.

## Format fixture

```json
{ "name": "invalid_spec_budget_negative", "schema": "job_spec", "valid": false, "payload": { ... }, "expect_path": "budget_usd" }
```

- `valid: true` → kedua sisi wajib menerima.
- `valid: false` → kedua sisi wajib menolak, dengan salah satu error berawalan `expect_path`
  (path gaya Pydantic; field asing dilaporkan di nama field-nya).
- `schema: "event"` → envelope 1.3 lalu `data` sesuai `event_type` (path data berawalan `data.`).
- `SHA256SUMS` memastikan isi fixture identik di kedua repo.

## Ringkasan keputusan kontrak

- Kind: `company_discovery`, `company_import`, `contact_finder`, `social_listening`, `book_ingest`,
  `opportunity_scoring`, `strategy`, `content_bank`; tahap per kind di `KIND_STAGES`.
- Semua job: `llm_assist` (default `false`), `budget_usd` (`null` = tanpa plafon job, maks 100).
- Alasan pause: `captcha`, `budget`, `manual`, `local_model_unavailable`.
- Event baru memakai envelope job yang sama dengan 1.2 (`job_id`, `mcp_job_id`, `sequence` per job) dengan
  `contract_version ≥ 1.3`. Event job 1.2 berversi 1.0–1.2 tetap diproses penerima Modul 3.
- Pagination: `cursor`, `limit ≤ 200` (default 50) → `{ items, next_cursor, total_estimate }`.
- Upload: `POST /uploads` (stream, header `X-Upload-Kind: pdf|xlsx|csv`, `X-Filename`), PDF ≤ 100 MB, XLSX/CSV ≤ 20 MB.
