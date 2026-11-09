# Kontrak 1.3 — fixture bersama Dashboard ↔ MCP

Aditif terhadap `intel-1.2` (tool & event 1.2 tidak berubah). Task: DSH-V1-00 / MCP-V1-00.

| Bagian | Sumber Zod (Dashboard) |
|---|---|
| Job kind, parameter per kind, `llm_assist`, `budget_usd`, status `awaiting_review`/`paused`, review & resume, event, pagination, error | `backend/src/shared/schemas/intel-1.3.schema.ts` |
| Toolset baca `mi_*`, `ci_*`, `opp_*`, `ct_*`, `kn_*`, `data_export`, respons `POST /uploads` | `backend/src/shared/schemas/intel-1.3-tools.schema.ts` |

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
