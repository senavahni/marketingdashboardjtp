# Task: QA — Test Perhitungan, API, UI, Ekspor & Checklist Rilis
**ID:** M2_TASK_005
**Status:** To Do
**Dependencies:** M2_TASK_001, 003, 004
**Estimasi:** 2 person-days (QA + dev)
**Acuan:** golden test [PRD §6.5](M2_PRD.md#65-data-uji-acuan-golden-test), [Use Cases](M2_USE_CASES.md)

## Objective
Memastikan angka yang dilaporkan **benar dan konsisten** di semua tampilan & file ekspor, hak akses aman, dan alur utama lulus E2E.

## A. Unit Test — Backend (Jest, `backend/test/unit/web-report.calculator.spec.ts`)
- [ ] GT-1 s.d. GT-5: semua metrik, `funnel`, dan `null` sesuai tabel PRD §6.5 (perbandingan string desimal untuk rupiah).
- [ ] Insight per golden test:
  - GT-1: `COST_COVERED`, `RPV_ABOVE_CPV`
  - GT-2: `NO_COST`
  - GT-4: `COST_COVERED`, `RPV_ABOVE_CPV`, `LEAD_QUALITY_LOW`, `LEAD_CR_LOW`
  - GT-5: `COST_NOT_COVERED`, `NO_SALES`
- [ ] Batas ambang: L→S tepat 2,0000 → **tidak** `LEAD_QUALITY_LOW`; ROAS tepat 1 → `COST_COVERED`.
- [ ] Pembulatan half-up (mis. 2/3 → 66,6667) dan nominal maksimum `999999999999999.99` tanpa kehilangan presisi.
- [ ] Hasil tidak pernah `NaN`/`Infinity`.

## B. Integration Test — API
- [ ] CRUD sesuai TASK_001 §C, termasuk respons 201/200/204 dan bentuk objek.
- [ ] Validasi: 400 `VALIDATION_ERROR` (negatif, desimal pada jumlah, string kosong), 422 `FUNNEL_INCONSISTENT`, 422 `INVALID_DATE_RANGE`, 422 `INVALID_PERIOD`.
- [ ] RBAC matriks PRD §3 (Owner/Admin/Member pembuat/Member lain/Viewer/non-anggota). Non-anggota & sesi workspace lain → 404 (anti-IDOR).
- [ ] 409 `VERSION_CONFLICT` pada PATCH dengan versi lama.
- [ ] Soft delete: hilang dari list & compare; GET → 404.
- [ ] Compare: < 2 atau > 12 id → 400; salah satu id milik workspace lain → 404.
- [ ] Constraint DB menolak insert langsung `sales_count > leads` (memastikan migrasi bagian 2 terpasang).

## C. Unit Test — Frontend (Vitest)
- [ ] `web-report-format.ts`: persen adaptif, rupiah penuh & singkat, ROAS, periode, null.
- [ ] Skema Zod form: semua aturan PRD §5.
- [ ] `buildReportModel`, nama file, escaping CSV (anti injection), pemetaan null.
- [ ] Komponen: `KpiCard` menampilkan "—" + tooltip untuk null; `FunnelChart` lebar minimum tahap kecil.

## D. E2E (Playwright)
Jika belum ada konfigurasi Playwright di repo, tambahkan di `frontend/e2e/` dengan seed akun Modul 1.

| ID | Skenario | Cek utama |
|---|---|---|
| E2E-M2-01 | UC-M2-01 dengan data GT-1 | Modal tampil ROAS 10,00x, AOV Rp750.000, Lead CR 4,00% |
| E2E-M2-02 | UC-M2-02: buka via `?session=`, ubah omset | ROAS berubah menjadi 11,00x; refresh halaman tetap konsisten |
| E2E-M2-03 | UC-M2-03: unduh 4 format untuk GT-4 | File terunduh, ekstensi & nama benar; CSV & XLSX diparse di test dan dibandingkan dengan nilai API |
| E2E-M2-04 | UC-M2-04 hapus | Sesi hilang dari daftar; link lama → toast "tidak ditemukan" |
| E2E-M2-05 | UC-M2-05 (P1) bandingkan GT-3a vs GT-3b | Dua grafik + tabel; ▲ pada Omset & RPV Februari |
| E2E-M2-06 | Viewer | Tidak ada tombol buat/ubah/hapus; ekspor tetap bisa |

## E. Verifikasi Manual Ekspor (sekali sebelum rilis)
- [ ] PDF di Chrome PDF viewer & Adobe Reader.
- [ ] XLSX di Microsoft Excel & LibreOffice Calc (rumus menghitung ulang, tanpa `#DIV/0!`).
- [ ] CSV di Excel (locale Indonesia) & LibreOffice.
- [ ] PPTX di PowerPoint 365 & LibreOffice Impress (tanpa "repair", chart bisa diedit).

## F. Checklist Rilis Modul 2
- [ ] Semua FR P0 lulus; FR P1 lulus atau disembunyikan.
- [ ] Coverage ≥ 80% untuk `backend/src/modules/web-reports` dan `frontend/src/lib/web-report-*`.
- [ ] Migrasi diuji di salinan DB yang sudah berisi data Modul 1 (tidak mengubah tabel lama).
- [ ] Swagger memuat semua endpoint `web-reports`.
- [ ] Tidak ada `console.log`; error ekspor tercatat di error tracker.
- [ ] Ukuran bundle awal sesuai NFR-02.
- [ ] Status di [README §7](README.md#7-status-implementasi) diperbarui.
