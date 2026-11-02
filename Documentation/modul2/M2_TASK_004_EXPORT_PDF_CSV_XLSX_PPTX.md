# Task: Ekspor Laporan — PDF, CSV, XLSX, PPTX
**ID:** M2_TASK_004
**Status:** To Do
**Dependencies:** M2_TASK_003 (komponen grafik, tema warna, util format)
**Estimasi:** 3 person-days (Frontend)
**Acuan:** [UC-M2-03](M2_USE_CASES.md#uc-m2-03-mengekspor-laporan), README D7

## Objective
Mengekspor hasil **satu sesi** ke 4 format di browser, dengan angka identik dengan modal (sumber: objek `WebReportSession` yang sama).

## A. Arsitektur
```
frontend/src/lib/web-report-export/
  index.ts            // exportWebReport(session, format): Promise<void>
  report-model.ts     // buildReportModel(session) → struktur netral (judul, KPI, tabel metrik, funnel, insight) — dipakai semua format
  file-name.ts        // laporan-website_<slug-judul>_<periode>.<ext>
  export-csv.ts
  export-xlsx.ts      // exceljs
  export-pdf.ts       // jspdf + jspdf-autotable
  export-pptx.ts      // pptxgenjs
  chart-to-png.ts     // render komponen grafik off-screen → SVG → PNG (untuk PDF)
```
- [ ] Library dimuat dengan `import()` dinamis saat user memilih format (NFR-02). Versi: stable terbaru saat implementasi, di-*pin* di `package.json` seperti dependency lain.
- [ ] `buildReportModel` adalah satu-satunya tempat yang memetakan `results` → label & nilai terformat (memakai `lib/web-report-format.ts`). Exporter tidak menghitung ulang apa pun.
- [ ] Menu **Ekspor ▾** di modal: PDF · Excel (.xlsx) · CSV · PowerPoint (.pptx). Item yang sedang diproses menampilkan spinner; item lain nonaktif. Gagal → toast "Ekspor gagal, coba lagi".
- [ ] Nama file: slug judul `[a-z0-9-]`, maks 60 karakter + periode (`2026-10`, `2026-Q4`, `2026`, atau `20261001-20261115`). Contoh `laporan-website_website-oktober-2026_2026-10.pdf`.
- [ ] Footer/metadata semua file: "Dibuat dari Matrika Dashboard · {tanggal ekspor} · Rumus versi {N}".

## B. CSV
- [ ] UTF-8 dengan BOM, pemisah koma, baris `\r\n`, nilai di-quote sesuai RFC 4180.
- [ ] Header: `bagian,metrik,kunci,nilai,satuan`. Bagian: `info` (judul, periode), `input`, `hasil`, `insight`.
- [ ] Nilai angka **mentah** (titik desimal, tanpa pemisah ribuan, mis. `0.0058`, `56380950.00`) agar bisa diolah ulang; `null` → sel kosong.
- [ ] **Anti CSV injection:** nilai teks (judul, catatan, pesan) yang diawali `=`, `+`, `-`, `@`, tab, atau CR diberi prefix `'`.

## C. XLSX (exceljs)
- [ ] Sheet **"Ringkasan"**:
  - Blok judul & periode.
  - Tabel **Input** (label · nilai) dengan format angka `#,##0` dan rupiah `"Rp"#,##0`.
  - Tabel **Hasil** (metrik · nilai · rumus teks · arti). Sel nilai berisi **rumus Excel** yang merujuk sel input (mis. `=IF(B6=0,"",B7/B6)` dengan format `0.00%`), plus `result` dari backend sebagai nilai cache, sehingga file tetap benar saat dibuka dan ikut berubah jika user mengedit input.
  - Tabel **Insight** (level · pesan).
- [ ] Sheet **"Funnel"**: tahap · jumlah · % dari pengunjung · % dari tahap sebelumnya.
- [ ] Lebar kolom disesuaikan, header tebal dengan warna tema, *freeze pane* di baris header, nama sheet & workbook properti (judul, pembuat).
- [ ] Grafik native XLSX **tidak** diwajibkan (keterbatasan exceljs); grafik ada di PDF & PPTX.

## D. PDF (jspdf + jspdf-autotable)
- [ ] A4 portrait, margin 15 mm, font standar yang mendukung Latin (Helvetica). Teks user di-render sebagai teks (bukan HTML).
- [ ] Isi halaman 1: header (judul, periode, jenis), 4 kartu KPI, grafik funnel + grafik omset vs biaya (PNG 2x resolusi dari `chart-to-png.ts`).
- [ ] Halaman berikut (otomatis): tabel metrik (autotable), insight & rencana aksi (ikon teks ✔ ⚠ ✖ ℹ + warna), catatan.
- [ ] Nomor halaman "Hal. x / y" + footer metadata di setiap halaman.

## E. PPTX (pptxgenjs) — P1
Mengikuti struktur deck dari sumber (Laporan Tahunan Performa Website), 16:9, palet **navy gelap `#0F2340`, teal `#0E9384`, latar terang `#F5F7FA`**:

| Slide | Isi |
|---|---|
| 1. Cover | Latar navy; judul "LAPORAN PERFORMA WEBSITE" (atau "LAPORAN TAHUNAN PERFORMA WEBSITE" bila `period_type = yearly`); subjudul teal "Analisis Konversi Finansial & Optimasi Prospek Internal"; periode; "Dibuat oleh: {nama workspace}" |
| 2. Ringkasan Eksekutif Finansial | 3 kartu: ROAS (x + ROI di keterangan), AOV, RPV, masing-masing dengan 1 kalimat arti |
| 3. Metrik Konversi Funnel | Kiri: tabel Metrik · Angka · Deskripsi (Lead CR, Sales CR, L→S CR). Kanan: **bar chart native** Pengunjung/Leads/Sales |
| 4. Omset vs Biaya Website | **Bar chart native** Omset vs Maintenance vs Iklan + teks "Omset {roas}x biaya" |
| 5. Analisis Strategis & Rencana Aksi | Poin-poin dari insight (judul tebal + penjelasan), dan catatan bila ada |

- [ ] Chart memakai chart PowerPoint native (`slide.addChart`) agar bisa diedit di PowerPoint.
- [ ] Teks panjang dipotong/disusutkan (`fit: 'shrink'`) agar tidak keluar slide.
- [ ] Metadata presentasi: title, company = nama workspace.

## Acceptance Criteria
1. Untuk GT-1 dan GT-4, keempat file berisi angka **identik** dengan modal (dicek per metrik).
2. CSV terbuka benar di Excel & LibreOffice (karakter "—" dan "Rp" tidak rusak); judul `=HYPERLINK(...)` tersimpan sebagai teks.
3. XLSX: mengubah sel input "Total pengunjung" di Excel ikut mengubah Lead CR, Sales CR, dan RPV; pembagian nol menghasilkan sel kosong, bukan `#DIV/0!`.
4. PDF: grafik tajam saat di-zoom 200%; tabel panjang pindah halaman tanpa terpotong.
5. PPTX terbuka tanpa peringatan "repair" di PowerPoint 365 & LibreOffice Impress; chart bisa diedit datanya.
6. Bundle awal frontend tidak bertambah > 20 KB gzip (library ekspor ada di chunk terpisah).
7. Unit test: `buildReportModel`, `file-name`, escaping CSV, serta pemetaan `null` → "—"/kosong.
