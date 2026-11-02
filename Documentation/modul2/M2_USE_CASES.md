# Use Cases — Modul 2: Laporan Performa Website

Setiap use case berisi aktor, prasyarat, alur utama, alur alternatif/error, dan hasil akhir. Data contoh memakai golden test di [PRD §6.5](M2_PRD.md#65-data-uji-acuan-golden-test). Kode `E2E-M2-xx` merujuk ke skenario Playwright di [TASK_005](M2_TASK_005_QA.md).

| UC | Judul | FR | Task |
|---|---|---|---|
| UC-M2-01 | Membuat sesi laporan & melihat hasil | FR-01–04 | 001, 002, 003 |
| UC-M2-02 | Membuka kembali & mengubah sesi | FR-04, FR-05, FR-12 | 001, 002, 003 |
| UC-M2-03 | Mengekspor laporan | FR-07–10 | 004 |
| UC-M2-04 | Menghapus sesi | FR-06 | 001, 002 |
| UC-M2-05 | Membandingkan beberapa sesi (P1) | FR-11 | 001, 003 |

---

### UC-M2-01: Membuat Sesi Laporan & Melihat Hasil
- **Aktor:** Member/Admin/Owner (Tim Internal Website)
- **Prasyarat:** User login dan menjadi anggota workspace dengan role ≥ Member.

**Alur utama**
1. User mengklik **"Laporan Website"** di sidebar. Sistem menampilkan daftar sesi (kosong → empty state "Belum ada laporan" + tombol **"+ Laporan Baru"**).
2. User mengklik **"+ Laporan Baru"**. Dialog form terbuka dengan `period_type = Bulanan` dan bulan berjalan terpilih.
3. User mengisi: judul "Website — Oktober 2026", pengunjung 20.000, leads 800, sales 200, omset Rp150.000.000, biaya maintenance Rp10.000.000, biaya iklan Rp5.000.000. Input rupiah otomatis diformat ribuan saat diketik.
4. User mengklik **"Hitung & Simpan"**.
5. Backend memvalidasi, menghitung metrik, dan menyimpan sesi + snapshot hasil (`formula_version = 1`).
6. Dialog form tertutup, sesi baru muncul paling atas di daftar, dan **modal Hasil Laporan** langsung terbuka berisi:
   - Kartu KPI: ROAS **10,00x**, AOV **Rp750.000**, RPV **Rp7.500**, Omset **Rp150.000.000** (ROI 900%, total biaya Rp15.000.000).
   - Funnel: 20.000 → 800 (Lead CR 4,00%) → 200 (L→S 25,00%); Sales CR 1,00%.
   - Bar chart Omset vs Biaya Maintenance vs Biaya Iklan.
   - Tabel metrik + interpretasi, insight `COST_COVERED` dan `RPV_ABOVE_CPV`.

**Alur alternatif / error**
- 3a. Leads > pengunjung atau sales > leads → pesan di field terkait ("Leads tidak boleh melebihi jumlah pengunjung"), tombol simpan nonaktif. Jika lolos ke API → 422 `FUNNEL_INCONSISTENT` dengan `details.field`.
- 3b. Angka negatif, desimal pada field jumlah, atau melebihi batas → pesan validasi per field; API → 400 `VALIDATION_ERROR`.
- 3c. `period_type = Kustom` dengan tanggal akhir < tanggal awal → API 422 `INVALID_DATE_RANGE`.
- 3d. Biaya 0 → sesi tetap tersimpan; ROAS & ROI tampil "—" dengan insight `NO_COST`.
- 3e. Sales 0 → AOV "—", insight `NO_SALES`.
- 4a. Jaringan gagal → data form tidak hilang, toast "Gagal menyimpan, coba lagi".
- 1a. Viewer → tombol "+ Laporan Baru", Ubah, dan Hapus tidak tampil; API → 403 `FORBIDDEN`.

**Hasil akhir:** 1 sesi tersimpan dengan input & hasil, dan hasilnya tampil di modal. (E2E-M2-01)

---

### UC-M2-02: Membuka Kembali & Mengubah Sesi
- **Aktor:** Semua role (lihat); pembuat sesi atau Admin/Owner (ubah)
- **Prasyarat:** Ada minimal 1 sesi di workspace.

**Alur utama**
1. User membuka "Laporan Website". Daftar menampilkan judul, periode, jenis, pengunjung, sales, omset, ROAS, pembuat, dan tanggal update.
2. User mengklik baris sesi → modal Hasil Laporan terbuka dari snapshot tersimpan (tanpa hitung ulang) dan URL berubah menjadi `?session=<id>`.
3. User mengklik **"Ubah"** di modal → form terisi data sesi.
4. User mengubah omset menjadi Rp165.000.000 → **"Hitung & Simpan"**.
5. Backend menghitung ulang dengan rumus versi terbaru, menyimpan, dan modal menampilkan hasil baru (ROAS 11,00x).

**Alur alternatif / error**
- 2a. Membuka link `?session=<id>` yang dihapus atau milik workspace lain → toast "Laporan tidak ditemukan", modal tidak terbuka (API 404 `NOT_FOUND`).
- 2b. Sesi dibuat dengan `formula_version` lama → modal menampilkan badge "Dihitung dengan rumus versi N"; hasil tidak berubah sampai sesi diubah.
- 3a. Member yang bukan pembuat → tombol "Ubah" tidak tampil; API → 403.
- 4a. Sesi diubah user lain di antara buka dan simpan → API 409 `VERSION_CONFLICT`; UI menampilkan "Laporan sudah diubah orang lain — muat ulang".

**Hasil akhir:** Sesi terbuka kembali dengan hasil yang sama persis seperti saat disimpan; perubahan tersimpan dan hasilnya diperbarui. (E2E-M2-02)

---

### UC-M2-03: Mengekspor Laporan
- **Aktor:** Semua role
- **Prasyarat:** Modal Hasil Laporan terbuka.

**Alur utama**
1. User mengklik **"Ekspor"** → menu: PDF, Excel (XLSX), CSV, PowerPoint (PPTX).
2. User memilih **PDF** → tombol menampilkan loading, file `laporan-website_website-oktober-2026_2026-10.pdf` terunduh: A4, header, kartu KPI, grafik funnel & revenue vs biaya, tabel metrik, insight, catatan, footer "Dibuat dari Matrika Dashboard · {tanggal}".
3. User memilih **XLSX** → workbook dengan sheet "Ringkasan" (input + hasil, format rupiah/persen; sel hasil berisi **rumus Excel** yang merujuk sel input) dan sheet "Funnel".
4. User memilih **CSV** → file UTF-8 (BOM) berisi baris `bagian,metrik,nilai,satuan` untuk semua input & hasil (angka mentah, titik desimal).
5. User memilih **PPTX** (P1) → deck 16:9, 5 slide: Cover, Ringkasan Eksekutif Finansial (ROAS/AOV/RPV), Metrik Funnel (tabel + chart), Omset vs Biaya (chart), Analisis & Rencana Aksi (insight). Grafik adalah chart PowerPoint native yang bisa diedit.

**Alur alternatif / error**
- 2a. Gagal membuat file (mis. memori browser) → toast "Ekspor gagal" + detail di console error tracker; tombol kembali aktif.
- 2b. Judul berisi karakter ilegal untuk nama file → disanitasi menjadi slug `a-z0-9-`.
- 3a. Nilai `null` (mis. ROAS tanpa biaya) → ditulis "—" di PDF/PPTX, sel kosong di XLSX, kosong di CSV.

**Hasil akhir:** File terunduh dan angka di dalamnya identik dengan modal. (E2E-M2-03)

---

### UC-M2-04: Menghapus Sesi
- **Aktor:** Pembuat sesi, Admin, Owner
- **Prasyarat:** Sesi ada.

**Alur utama**
1. User mengklik menu ⋯ pada baris sesi (atau tombol "Hapus" di modal) → **"Hapus"**.
2. Dialog konfirmasi: "Hapus laporan 'Website — Oktober 2026'? Tindakan ini tidak bisa dibatalkan dari UI."
3. User mengonfirmasi → backend mengisi `deleted_at`; sesi hilang dari daftar, modal tertutup, toast "Laporan dihapus".

**Alur alternatif / error**
- 1a. Member bukan pembuat / Viewer → opsi tidak tampil; API → 403.
- 3a. Sesi sudah dihapus di tab lain → 404, daftar dimuat ulang.

**Hasil akhir:** Sesi tidak lagi muncul di daftar, perbandingan, maupun link langsung. Data tetap ada di DB (soft delete). (E2E-M2-04)

---

### UC-M2-05: Membandingkan Beberapa Sesi (P1)
- **Aktor:** Semua role
- **Prasyarat:** Ada ≥ 2 sesi.

**Alur utama**
1. User mencentang 2–12 sesi di daftar (mis. GT-3a Januari & GT-3b Februari) → **"Bandingkan"**.
2. Modal **Perbandingan** terbuka, sesi diurutkan berdasarkan `period_start`:
   - **Laporan Finansial:** bar Omset + garis RPV (dua sumbu Y).
   - **Laporan Efisiensi:** garis Lead CR, Sales CR, L→S CR.
   - Tabel perbandingan semua metrik, dengan nilai terbaik per baris ditandai (ikon ▲ + teks "tertinggi", tidak hanya warna).
3. Pada contoh Januari vs Februari, user melihat Sales CR Januari lebih tinggi (1,00% vs 0,50%), tetapi Omset dan RPV Februari lebih tinggi (Rp75 jt / Rp7.500). Ini menjadi bahan kesimpulan "nominal lebih valid daripada CR saja".

**Alur alternatif / error**
- 1a. Memilih > 12 sesi → checkbox lain nonaktif + hint "Maksimal 12 laporan".
- 2a. Jenis periode campuran (bulanan & tahunan) → banner peringatan "Periode tidak sebanding".

**Hasil akhir:** User dapat menunjukkan tren efisiensi dan finansial antarperiode. (E2E-M2-05)
