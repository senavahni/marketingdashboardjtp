# Task: Database, Service Perhitungan & REST API Laporan Website
**ID:** M2_TASK_001
**Status:** To Do
**Dependencies:** Modul 1 TASK_001 (auth, RBAC `AccessService`, format error) — sudah selesai
**Estimasi:** 3 person-days (Backend)
**Acuan:** rumus & golden test di [PRD §6](M2_PRD.md#6-spesifikasi-perhitungan), konvensi API di [M1_ARCHITECTURE §4](../modul1/M1_ARCHITECTURE.md#4-konvensi-api)

## Objective
Menambahkan tabel `web_report_sessions`, service perhitungan murni (pure function) yang menjadi satu-satunya sumber rumus, dan REST API CRUD sesi + perbandingan, dengan RBAC per workspace.

## A. Database

### A.1 DDL (migrasi baru `backend/prisma/migrations/<timestamp>_m2_web_report_sessions/`)
Bagian enum/tabel/FK dihasilkan oleh `prisma migrate diff`. CHECK constraint dan partial index ditulis manual di bagian 2, mengikuti pola migrasi init Modul 1.

```sql
CREATE TYPE "web_report_period_type" AS ENUM ('monthly', 'quarterly', 'yearly', 'custom');

CREATE TABLE "web_report_sessions" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"     UUID          NOT NULL,
  "title"            VARCHAR(150)  NOT NULL,
  "period_type"      "web_report_period_type" NOT NULL DEFAULT 'monthly',
  "period_start"     DATE          NOT NULL,
  "period_end"       DATE          NOT NULL,
  -- input manual
  "visitors"         INTEGER       NOT NULL,
  "leads"            INTEGER       NOT NULL,
  "sales_count"      INTEGER       NOT NULL,
  "revenue"          NUMERIC(18,2) NOT NULL,
  "cost_maintenance" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "cost_ads"         NUMERIC(18,2) NOT NULL DEFAULT 0,
  "notes"            TEXT,
  -- snapshot hasil
  "results"          JSONB         NOT NULL,
  "formula_version"  SMALLINT      NOT NULL,
  -- meta
  "version"          INTEGER       NOT NULL DEFAULT 1,      -- optimistic locking
  "created_by"       UUID,
  "updated_by"       UUID,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "deleted_at"       TIMESTAMPTZ(6),
  CONSTRAINT "web_report_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "web_report_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id"),
  CONSTRAINT "web_report_sessions_created_by_fkey"   FOREIGN KEY ("created_by")   REFERENCES "users"("id"),
  CONSTRAINT "web_report_sessions_updated_by_fkey"   FOREIGN KEY ("updated_by")   REFERENCES "users"("id")
);

-- ===== Bagian 2: manual =====
ALTER TABLE "web_report_sessions"
  ADD CONSTRAINT "wrs_counts_non_negative" CHECK ("visitors" >= 0 AND "leads" >= 0 AND "sales_count" >= 0),
  ADD CONSTRAINT "wrs_funnel_order"        CHECK ("leads" <= "visitors" AND "sales_count" <= "leads"),
  ADD CONSTRAINT "wrs_money_non_negative"  CHECK ("revenue" >= 0 AND "cost_maintenance" >= 0 AND "cost_ads" >= 0),
  ADD CONSTRAINT "wrs_period_range"        CHECK ("period_end" >= "period_start");

CREATE INDEX "wrs_workspace_period_idx"
  ON "web_report_sessions" ("workspace_id", "period_start" DESC, "created_at" DESC)
  WHERE "deleted_at" IS NULL;
```

- [ ] Tambah model `web_report_sessions` + enum di `schema.prisma` (relasi ke `workspaces` dan `users` — `creator`/`updater`), lalu `prisma generate`.
- [ ] Migrasi berjalan dari nol (`npm run db:migrate`) maupun di atas DB Modul 1 yang sudah ada.
- [ ] Seed dummy (`seed-dummy`) menambah 4 sesi dari golden test GT-1, GT-3a, GT-3b, GT-4.

### A.2 Struktur `results` (JSONB)
```json
{
  "lead_cr": 4.0, "sales_cr": 1.0, "lead_to_sales_cr": 25.0,
  "cost_total": "15000000.00", "aov": "750000.00", "rpv": "7500.00",
  "cost_per_visitor": "750.00", "roas": 10.0, "roi": 900.0,
  "revenue_minus_cost": "135000000.00",
  "funnel": { "no_conversion": 19200, "leads_only": 600, "sales": 200 },
  "insights": [
    { "code": "COST_COVERED", "level": "success", "message": "Omset 10,00x lipat biaya website — biaya tertutup." }
  ]
}
```
Nilai rupiah dikirim sebagai **string desimal** (hindari presisi float untuk nominal besar). Persen/ROAS dikirim sebagai number 4 desimal. Nilai yang tidak terdefinisi dikirim sebagai `null`.

## B. Service Perhitungan
Lokasi: `backend/src/modules/web-reports/web-report.calculator.ts`

- [ ] `calculateWebReport(input: WebReportInput): WebReportResults` — **pure function**, tanpa I/O, implementasi persis [PRD §6.1–6.4](M2_PRD.md#6-spesifikasi-perhitungan).
- [ ] `buildInsights(input, results): Insight[]` — aturan [PRD §6.6](M2_PRD.md#66-insight-otomatis-rule-based-bukan-ai). Ambang (`LEAD_TO_SALES_LOW_THRESHOLD = 2`, `LEAD_CR_LOW_THRESHOLD = 1`, `ROAS_BREAK_EVEN = 1`) sebagai konstanta bernama.
- [ ] `FORMULA_VERSION = 1` diekspor dari file yang sama.
- [ ] Aritmetika rupiah memakai `Prisma.Decimal` (decimal.js, sudah ikut Prisma). Rasio dibulatkan *half-up* 4 desimal; rupiah 2 desimal.
- [ ] Pembagian dengan nol → `null` (tidak pernah `NaN`/`Infinity`).

## C. API Endpoints
Semua butuh `Authorization: Bearer`. Akses dicek dengan `AccessService.assertWorkspace` (sesi workspace lain → 404 `NOT_FOUND`).

**Objek respons `WebReportSession`**
```json
{
  "id": "uuid", "workspace_id": "uuid", "title": "Website — Oktober 2026",
  "period_type": "monthly", "period_start": "2026-10-01", "period_end": "2026-10-31",
  "input": { "visitors": 20000, "leads": 800, "sales_count": 200, "revenue": "150000000.00",
             "cost_maintenance": "10000000.00", "cost_ads": "5000000.00" },
  "notes": null, "results": { "...": "lihat A.2" }, "formula_version": 1, "version": 1,
  "created_by": { "type": "user", "id": "uuid", "name": "Owner Demo" },
  "updated_by": { "type": "user", "id": "uuid", "name": "Owner Demo" },
  "created_at": "...", "updated_at": "..."
}
```

| Method & Path | Role min. | Keterangan |
|---|---|---|
| `GET /api/v1/workspaces/:workspaceId/web-reports?limit=&cursor=&period_type=&year=` | viewer | List `{ data, next_cursor }`, urut `period_start desc, created_at desc`. Item list **tanpa** `insights` (ringkas) |
| `POST /api/v1/workspaces/:workspaceId/web-reports` | member | Body = input [PRD §5](M2_PRD.md#5-input-manual-per-sesi). Hitung → simpan → 201 + objek lengkap |
| `GET /api/v1/web-reports/:id` | viewer | Objek lengkap (snapshot, tidak dihitung ulang) |
| `PATCH /api/v1/web-reports/:id` | member (pembuat) / admin | Body parsial + `version` wajib. Hitung ulang dengan `FORMULA_VERSION` terbaru, `version + 1`. Versi beda → 409 `VERSION_CONFLICT` |
| `DELETE /api/v1/web-reports/:id` | member (pembuat) / admin | Soft delete → 204 |
| `GET /api/v1/workspaces/:workspaceId/web-reports/compare?ids=a,b,c` (P1) | viewer | 2–12 id; semua harus milik workspace (selain itu 404). Respons `{ data: WebReportSession[] }` urut `period_start asc` |

- [ ] Schema Zod di `web-reports.schemas.ts`: integer ≥ 0 ≤ 2.000.000.000; rupiah diterima sebagai string/number desimal maks 2 angka di belakang koma, ≥ 0, ≤ 999.999.999.999.999,99; `title` di-trim 1–150; `notes` ≤ 2000.
- [ ] Untuk `period_type` ≠ `custom`, backend memvalidasi bahwa rentang sesuai (awal–akhir bulan/kuartal/tahun); jika tidak → 422 `INVALID_PERIOD`.
- [ ] Error baru (tambahkan ke tabel error M1_ARCHITECTURE §4): 422 `FUNNEL_INCONSISTENT` (`details.field` = `leads` | `sales_count`), 422 `INVALID_PERIOD`. Pakai yang sudah ada: `VALIDATION_ERROR`, `INVALID_DATE_RANGE`, `VERSION_CONFLICT`, `FORBIDDEN`, `NOT_FOUND`.
- [ ] Controller memakai pola Modul 1 (`ZodPipe`, `ApiZodBody`, `UuidPipe`, `CurrentUser`) sehingga muncul di Swagger.
- [ ] Daftarkan `WebReportsModule` di `AppModule`.
- [ ] Tidak mencatat ke `activity_logs`/notifikasi (di luar scope; sesi bukan entitas project).

## D. Struktur File
```
backend/src/modules/web-reports/
  web-reports.module.ts
  web-reports.controller.ts
  web-reports.service.ts
  web-reports.schemas.ts
  web-report.calculator.ts
backend/test/unit/web-report.calculator.spec.ts
backend/test/integration/web-reports.api.spec.ts   (atau mengikuti pola smoke test Modul 1)
```

## Acceptance Criteria
1. Semua golden test GT-1 s.d. GT-5 menghasilkan nilai persis seperti [PRD §6.5](M2_PRD.md#65-data-uji-acuan-golden-test), termasuk `null`.
2. Insight yang dihasilkan untuk setiap golden test sesuai aturan §6.6 (dicek kode & level).
3. `leads > visitors` atau `sales_count > leads` → 422 `FUNNEL_INCONSISTENT`, dan constraint DB tetap menolak jika validasi aplikasi dilewati.
4. Viewer: GET 200, POST/PATCH/DELETE 403. Member non-pembuat: PATCH/DELETE 403. User bukan anggota: semua 404.
5. PATCH dengan `version` lama → 409; sesi tidak berubah.
6. Sesi terhapus tidak muncul di list/compare dan GET → 404.
7. Coverage modul `web-reports` ≥ 80%.
