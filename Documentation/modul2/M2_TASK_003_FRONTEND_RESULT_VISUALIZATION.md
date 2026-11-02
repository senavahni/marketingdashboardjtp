# Task: Frontend — Modal Hasil, Grafik & Perbandingan Sesi
**ID:** M2_TASK_003
**Status:** To Do
**Dependencies:** M2_TASK_002 (data layer & util format)
**Estimasi:** 3 person-days (+1 pd untuk perbandingan sesi P1)
**Acuan:** [PRD §6–7](M2_PRD.md#6-spesifikasi-perhitungan), [UC-M2-01, 02, 05](M2_USE_CASES.md)

## Objective
Menampilkan hasil sesi dalam modal yang **langsung menjawab "website ini berhasil atau tidak?"**: angka finansial terpenting di atas, funnel konversi di tengah, detail & rekomendasi di bawah. Semua angka berasal dari `results` backend; frontend hanya memformat.

## A. Prinsip Tampilan
- **Hierarki baca:** finansial dulu (ROAS, AOV, RPV, Omset), lalu efisiensi (CR), lalu detail. Sesuai saran sumber: nominal lebih menentukan daripada persentase.
- **Satu warna = satu makna**, konsisten di modal & ekspor:
  - Pengunjung = abu/biru netral, Leads = teal, Sales = navy/biru tua.
  - Omset = teal, Biaya = abu-oranye.
  - Status insight: success / warning / danger / info, **selalu dengan ikon + teks**.
- Angka besar memakai `tabular-nums`. Rupiah di kartu KPI disingkat (`Rp56,4 jt`) dengan nilai penuh di tooltip/`title`.
- Nilai `null` tampil "—" dengan tooltip alasannya (mis. "Biaya belum diisi").
- Grafik: **Recharts** (README D6), di-*lazy load* bersama modal. Setiap grafik punya `aria-label` ringkas dan tabel data alternatif (bagian E).

## B. Modal Hasil (`components/web-report/WebReportResultModal.tsx`)
Dialog lebar (maks 1100 px, tinggi maks 90vh, isi scroll). Layout:

```
┌────────────────────────────────────────────────────────────────────┐
│ Website — Oktober 2026            [Ubah] [Hapus] [Ekspor ▾] [✕]     │
│ Bulanan · 1–31 Okt 2026 · diperbarui 2 Nov oleh Owner Demo          │
├────────────────────────────────────────────────────────────────────┤
│ RINGKASAN EKSEKUTIF FINANSIAL                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ │ ROAS     │ │ AOV      │ │ RPV      │ │ OMSET    │                 │
│ │ 10,00x   │ │ Rp750 rb │ │ Rp7.500  │ │ Rp150 jt │                 │
│ │ ROI 900% │ │ per sales│ │ biaya/pengunjung Rp750 │ biaya Rp15 jt│ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                 │
├───────────────────────────────┬────────────────────────────────────┤
│ FUNNEL KONVERSI               │ OMSET vs BIAYA WEBSITE             │
│ Pengunjung ████████████ 20.000│  ▇▇▇▇▇▇ Omset Rp150 jt             │
│   ↓ Lead CR 4,00%             │  ▇ Maintenance Rp10 jt             │
│ Leads      ███          800   │  ▇ Iklan Rp5 jt                    │
│   ↓ Lead→Sales 25,00%         │                                    │
│ Sales      █            200   │                                    │
│ Sales CR (pengunjung→sales) 1,00%                                  │
├───────────────────────────────┴────────────────────────────────────┤
│ INSIGHT & RENCANA AKSI                                              │
│ ✔ Omset 10,00x lipat biaya website — biaya tertutup.                │
│ ✔ Tiap pengunjung bernilai Rp7.500, di atas biayanya (Rp750).       │
├────────────────────────────────────────────────────────────────────┤
│ TABEL METRIK (Metrik · Nilai · Rumus · Arti)          [▸ buka]      │
│ CATATAN                                                             │
└────────────────────────────────────────────────────────────────────┘
```

- [ ] **Header:** judul, badge jenis periode, rentang periode, pembuat/diperbarui; badge "Rumus versi N" bila `formula_version` < versi terbaru yang diketahui frontend. Tombol Ubah/Hapus sesuai hak; tombol Ekspor dari TASK_004.
- [ ] **Kartu KPI (4):** ROAS (sub: ROI), AOV (sub: "rata-rata per sales"), RPV (sub: "biaya/pengunjung Rp…"), Omset (sub: "total biaya Rp…"). Kartu ROAS diberi aksen status: ≥ 1 success, < 1 danger, null netral.
- [ ] **Funnel konversi** (`FunnelChart.tsx`): bar horizontal Pengunjung → Leads → Sales. Lebar proporsional terhadap pengunjung dengan **lebar minimum visual 2%** agar tahap kecil tetap terlihat (contoh GT-4: 34.505 → 110 → 2). Label angka selalu tampil. Persentase antar-tahap tampil di konektor ↓. Sales CR tampil sebagai baris ringkas di bawah funnel.
- [ ] **Omset vs Biaya** (`RevenueCostChart.tsx`): bar Omset, Biaya Maintenance, Biaya Iklan, dengan label nilai di atas bar dan sumbu Y format `Rp…jt/M`. Jika biaya 0 → tampil catatan "Biaya belum diisi".
- [ ] **Insight & Rencana Aksi:** daftar dari `results.insights`, urut danger → warning → info → success.
- [ ] **Tabel metrik** (collapsible, default terbuka di layar ≥ 1280 px): semua metrik PRD §6.1–6.2 dengan kolom Metrik, Nilai, Rumus (teks), Arti (1 kalimat, mengikuti interpretasi sumber, mis. Lead CR: "Dari 100 pengunjung, 4 mengisi form/order").
- [ ] **Catatan** user (teks biasa, di-escape; *line break* dipertahankan).
- [ ] Loading skeleton saat fetch `GET /web-reports/:id`; 404 → toast + tutup modal.

## C. Komponen Bersama
- [ ] `KpiCard`, `InsightList`, `MetricTable`, `FunnelChart`, `RevenueCostChart` diekspor dari `components/web-report/`. Grafik menerima prop `width/height` tetap dan `isAnimationActive={false}` agar bisa dirender *off-screen* untuk ekspor PDF (TASK_004).
- [ ] Konstanta warna grafik di `lib/web-report-theme.ts` (dipakai juga oleh XLSX/PPTX/PDF).

## D. Perbandingan Sesi (P1, FR-11, UC-M2-05)
`components/web-report/WebReportCompareModal.tsx`, memakai `GET .../web-reports/compare?ids=`.
- [ ] **Laporan Finansial:** ComposedChart. Bar = Omset (sumbu kiri, Rp), garis = RPV (sumbu kanan, Rp). Label sumbu jelas.
- [ ] **Laporan Efisiensi:** LineChart Lead CR, Sales CR, L→S CR (%). Legend dengan nama lengkap; titik data berlabel saat hover.
- [ ] **Tabel perbandingan:** baris = metrik, kolom = sesi (urut periode). Nilai terbaik per baris ditandai ikon ▲ + `aria-label="tertinggi"`. Untuk biaya, terbaik = terendah.
- [ ] Banner peringatan bila `period_type` campuran.
- [ ] Ekspor perbandingan **di luar scope** (cukup ekspor per sesi).

## E. Aksesibilitas
- [ ] Modal: fokus awal ke judul, `Esc` menutup, fokus kembali ke baris pemicu.
- [ ] Grafik punya `role="img"` + `aria-label` ringkas; data lengkap ada di tabel metrik.
- [ ] Kontras teks & elemen grafik ≥ WCAG AA pada tema terang.

## Acceptance Criteria
1. Untuk GT-1, modal menampilkan nilai persis seperti UC-M2-01 langkah 6.
2. Untuk GT-4, funnel menampilkan tahap Sales (2) tetap terlihat, Sales CR tampil `0,0058%`, ROAS `24,65x`, dan ROI `2.365%` (bukan "2465%").
3. Untuk GT-2 (biaya 0), kartu ROAS menampilkan "—" dengan tooltip, dan grafik biaya menampilkan catatan.
4. Membuka sesi lama tidak memicu hitung ulang (tidak ada request selain GET).
5. (P1) Perbandingan GT-3a vs GT-3b menunjukkan Sales CR Januari lebih tinggi, sementara Omset & RPV Februari bertanda ▲.
6. Lighthouse/axe pada modal: tidak ada pelanggaran *serious/critical*.
