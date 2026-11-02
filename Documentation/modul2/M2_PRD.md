# Product Requirements Document (PRD)
## Modul 2: Laporan Performa Website (Lead & Sales Report)

| | |
|---|---|
| Versi | 1.0 |
| Status | Draft — menunggu review |
| Dokumen terkait | [README](README.md), [Use Cases](M2_USE_CASES.md), [Modul 1 Architecture](../modul1/M1_ARCHITECTURE.md) |

---

### 1. Latar Belakang & Visi
Order masuk lewat website yang di-maintain tim internal. Sebagian order menjadi lead, dan sebagian lead menjadi sales. Tim butuh cara yang **konsisten dan cepat** untuk melaporkan seberapa berhasil website tersebut, dari sisi konversi maupun nominal rupiah, ke manajemen.

Visi Modul 2: **"Masukkan angka satu periode, langsung dapat laporan yang siap dipresentasikan."** Laporan berisi angka yang benar, grafik yang mudah dibaca, dan file ekspor yang bisa langsung dikirim.

### 2. Tujuan & Ukuran Keberhasilan

| Tujuan | Indikator keberhasilan (saat UAT) |
|---|---|
| Laporan cepat dibuat | User baru membuat 1 sesi dan melihat hasilnya dalam < 2 menit tanpa bantuan |
| Angka bisa dipercaya | 100% golden test (§6.5) lulus; angka di modal = angka di semua file ekspor |
| Mudah dibaca manajemen | Manajer bisa menjawab "website untung atau tidak?" dari modal hasil dalam < 10 detik (uji 3 orang) |
| Siap dikirim | Ekspor PDF/XLSX/CSV/PPTX terbuka tanpa error di aplikasi standar |

### 3. Persona & Hak Akses
Memakai RBAC per workspace dari Modul 1.

| Persona | Role | Kebutuhan |
|---|---|---|
| Tim Internal Website / Marketing Staff | Member | Input data periode, melihat hasil, ekspor |
| Marketing Manager | Admin/Owner | Melihat & membandingkan sesi, ekspor untuk manajemen, hapus sesi siapa pun |
| Stakeholder | Viewer | Hanya melihat hasil & ekspor |

| Aksi | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| Lihat daftar & hasil sesi | ✓ | ✓ | ✓ | ✓ |
| Ekspor | ✓ | ✓ | ✓ | ✓ |
| Buat sesi | ✓ | ✓ | ✓ | – |
| Ubah sesi | ✓ | ✓ | milik sendiri | – |
| Hapus sesi | ✓ | ✓ | milik sendiri | – |

### 4. Requirement Fungsional

| ID | Requirement | Prioritas | Task |
|---|---|---|---|
| FR-01 | Menu "Laporan Website" di sidebar workspace membuka halaman daftar sesi (urut periode terbaru) | P0 | 002 |
| FR-02 | Buat sesi dengan input manual (§5) dan validasi per field | P0 | 001, 002 |
| FR-03 | Saat disimpan, backend menghitung semua metrik (§6) dan menyimpan input + hasil sebagai satu sesi | P0 | 001 |
| FR-04 | Modal **Hasil Laporan**: kartu KPI, grafik funnel, grafik revenue vs biaya, tabel metrik, insight & rencana aksi | P0 | 003 |
| FR-05 | Ubah sesi → hasil dihitung ulang & disimpan | P0 | 001, 002 |
| FR-06 | Hapus sesi (soft delete) dengan konfirmasi | P0 | 001, 002 |
| FR-07 | Ekspor hasil sesi ke **PDF** | P0 | 004 |
| FR-08 | Ekspor hasil sesi ke **CSV** | P0 | 004 |
| FR-09 | Ekspor hasil sesi ke **XLSX** | P0 | 004 |
| FR-10 | Ekspor hasil sesi ke **PPTX** (format deck laporan manajemen) | P1 | 004 |
| FR-11 | Perbandingan 2–12 sesi: grafik tren Revenue + RPV dan tren Conversion Rate | P1 | 001, 003 |
| FR-12 | Link langsung ke hasil sesi (`?session=<id>`) membuka modal hasil | P1 | 003 |

### 5. Input Manual (per sesi)

| Field | Label UI | Tipe | Wajib | Aturan |
|---|---|---|---|---|
| `title` | Judul laporan | teks 1–150 | ✓ | contoh: "Website — Oktober 2026" |
| `period_type` | Jenis periode | `monthly` / `quarterly` / `yearly` / `custom` | ✓ | default `monthly` |
| `period_start`, `period_end` | Periode | tanggal | ✓ | `period_end ≥ period_start`. Untuk monthly/quarterly/yearly, rentang diisi otomatis dari pilihan bulan/kuartal/tahun |
| `visitors` | Total pengunjung website | bilangan bulat ≥ 0 | ✓ | |
| `leads` | Total order masuk / leads | bilangan bulat ≥ 0 | ✓ | `≤ visitors` |
| `sales_count` | Total sales (closing/lunas) | bilangan bulat ≥ 0 | ✓ | `≤ leads` |
| `revenue` | Total nominal sales (omset) | rupiah ≥ 0, 2 desimal | ✓ | |
| `cost_maintenance` | Biaya maintenance website | rupiah ≥ 0 | ✓ | default 0 |
| `cost_ads` | Biaya iklan | rupiah ≥ 0 | ✓ | default 0 |
| `notes` | Catatan | teks ≤ 2000 | – | ikut tampil di ekspor |

Batas atas: jumlah (count) ≤ 2.000.000.000, nominal ≤ 999.999.999.999.999,99 (sesuai `NUMERIC(18,2)`).

### 6. Spesifikasi Perhitungan
Semua perhitungan dilakukan di backend (README D3). Pembagian dengan nol menghasilkan `null`, yang ditampilkan "—" dengan tooltip penjelasan (mis. "Belum ada sales, AOV tidak dapat dihitung").

#### 6.1 Metrik Konversi (Laporan Efisiensi)

| Kunci | Nama | Rumus | Satuan |
|---|---|---|---|
| `lead_cr` | Lead CR (Website-to-Lead) | `leads ÷ visitors × 100` | % |
| `sales_cr` | Sales CR (Website-to-Sales) | `sales_count ÷ visitors × 100` | % |
| `lead_to_sales_cr` | Lead-to-Sales CR | `sales_count ÷ leads × 100` | % |

#### 6.2 Metrik Finansial (Laporan Finansial)

| Kunci | Nama | Rumus | Satuan |
|---|---|---|---|
| `cost_total` | Total biaya website | `cost_maintenance + cost_ads` | Rp |
| `aov` | Average Order Value | `revenue ÷ sales_count` | Rp |
| `rpv` | Revenue per Visitor (RPV/RPC) | `revenue ÷ visitors` | Rp |
| `cost_per_visitor` | Biaya per pengunjung | `cost_total ÷ visitors` | Rp |
| `roas` | ROAS | `revenue ÷ cost_total` | x (kali lipat) |
| `roi` | ROI | `(revenue − cost_total) ÷ cost_total × 100` | % |
| `revenue_minus_cost` | Selisih omset − biaya | `revenue − cost_total` | Rp |

> **Penting (koreksi sumber):** ROAS ditampilkan sebagai **"24,65x"**, bukan "2465%". ROI ditampilkan terpisah. Untuk data yang sama, ROAS 24,65x setara ROI 2.365%. `revenue_minus_cost` diberi label "Selisih omset − biaya", **bukan "profit"**, karena belum memperhitungkan HPP.

#### 6.3 Data Funnel (untuk grafik)
`no_conversion = visitors − leads`, `leads_only = leads − sales_count`, `sales = sales_count`. Ketiga nilai ini menjumlah ke `visitors`.

#### 6.4 Presisi & Format Tampilan
| Jenis | Disimpan | Ditampilkan (locale `id-ID`) |
|---|---|---|
| Persentase | 4 desimal | 2 desimal (`0,32%`). Jika `0 < nilai < 0,01` → 4 desimal (`0,0058%`) agar tidak tampil menyesatkan sebagai `0,01%` atau `0,00%` |
| Rupiah | 2 desimal | tanpa desimal: `Rp56.380.950`. Di kartu KPI boleh disingkat (`Rp56,4 jt`, `Rp1,2 M`) dengan nilai penuh di tooltip |
| ROAS | 4 desimal | `24,65x` |
| Jumlah | integer | `34.505` |

Pembulatan: *half-up* pada nilai yang disimpan. Perhitungan memakai aritmetika desimal (bukan float) untuk nominal rupiah.

#### 6.5 Data Uji Acuan (Golden Test)

| Kasus | visitors | leads | sales | revenue | cost (maint + ads) | Lead CR | Sales CR | L→S CR | AOV | RPV | ROAS | ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GT-1 Contoh perhitungan sumber | 20.000 | 800 | 200 | 150.000.000 | 15.000.000 | 4,0000 | 1,0000 | 25,0000 | 750.000 | 7.500 | 10,0000 | 900,0000 |
| GT-2 Contoh CR sumber (tanpa nominal) | 10.000 | 500 | 50 | 0 | 0 | 5,0000 | 0,5000 | 10,0000 | 0 | 0 | null | null |
| GT-3a Januari* | 10.000 | 300 | 100 | 50.000.000 | 5.000.000 | 3,0000 | 1,0000 | 33,3333 | 500.000 | 5.000 | 10,0000 | 900,0000 |
| GT-3b Februari* | 10.000 | 300 | 50 | 75.000.000 | 5.000.000 | 3,0000 | 0,5000 | 16,6667 | 1.500.000 | 7.500 | 15,0000 | 1.400,0000 |
| GT-4 Laporan aktual** | 34.505 | 110 | 2 | 112.761.900 | 4.574.519 | 0,3188 | 0,0058 | 1,8182 | 56.380.950 | 3.267,99 | 24,6500 | 2.365,0001 |
| GT-5 Tanpa pengunjung | 0 | 0 | 0 | 0 | 1.000.000 | null | null | null | null | null | 0,0000 | −100,0000 |

\* Sumber hanya memberi pengunjung, sales, dan omset Januari/Februari. Nilai leads dan biaya pada GT-3 adalah **asumsi untuk test**.
\*\* Sumber hanya menampilkan hasil akhir (AOV Rp56.380.950, RPV Rp3.268, ROAS 24,65x, Lead CR 0,32%, Sales CR 0,01%, L→S 1,82%). Input GT-4 adalah **rekonstruksi** yang menghasilkan angka-angka tersebut, bukan data asli. Ganti dengan data asli bila tersedia.

`cost_per_visitor` GT-1 = 750; GT-4 = 132,58.

#### 6.6 Insight Otomatis (rule-based, bukan AI)
Setiap sesi menghasilkan daftar insight `{ code, level, message }`. Ambang batas disimpan sebagai konstanta.

| Kode | Kondisi | Level | Pesan (ringkas) |
|---|---|---|---|
| `COST_COVERED` | `roas ≥ 1` | success | "Omset {roas}x lipat biaya website — biaya tertutup." |
| `COST_NOT_COVERED` | `roas < 1` | danger | "Omset belum menutup biaya website (ROAS {roas}x)." |
| `RPV_ABOVE_CPV` | `rpv > cost_per_visitor`, visitors > 0, dan cost_total > 0 | success | "Tiap pengunjung bernilai {rpv}, di atas biaya mendatangkannya ({cpv})." |
| `RPV_BELOW_CPV` | `rpv ≤ cost_per_visitor`, visitors > 0, dan cost_total > 0 | warning | "Nilai per pengunjung belum melebihi biaya per pengunjung." |
| `LEAD_QUALITY_LOW` | `lead_to_sales_cr < 2` dan leads > 0 | warning | "Lead-to-Sales {x}% (< 2%): traffic kurang tertarget atau follow-up lambat." Rencana aksi: percepat respons follow-up sales |
| `LEAD_CR_LOW` | `lead_cr < 1` dan visitors > 0 | info | "Lead CR {x}% masih punya ruang tumbuh." Rencana aksi: sederhanakan form order/landing page (UI/UX) |
| `NO_SALES` | `sales_count = 0` | warning | "Belum ada sales pada periode ini." |
| `NO_COST` | `cost_total = 0` | info | "Biaya belum diisi — ROAS & ROI tidak dihitung." |

Ambang 2% berasal dari sumber. Ambang 1% untuk Lead CR adalah **default yang perlu dikonfirmasi tim** (sumber tidak memberi angka).

`formula_version` (mulai `1`) disimpan per sesi. Jika rumus/insight berubah, versi naik dan sesi lama **tetap** menampilkan snapshot-nya. Hitung ulang hanya terjadi saat sesi diedit.

### 7. Tampilan Hasil (ringkas — detail di TASK_003)
1. **Header:** judul, periode, jenis periode, pembuat, tanggal update, tombol ekspor.
2. **Ringkasan Eksekutif Finansial:** kartu ROAS, AOV, RPV, Omset (+ Total Biaya, ROI sebagai sub-teks).
3. **Funnel Konversi:** grafik funnel horizontal Pengunjung → Leads → Sales dengan Lead CR, Sales CR, L→S CR di antara tahap.
4. **Revenue vs Biaya:** bar chart Omset vs Biaya Maintenance vs Biaya Iklan.
5. **Tabel metrik** lengkap dengan deskripsi & interpretasi (menggantikan grafik untuk pembaca layar).
6. **Insight & Rencana Aksi** (§6.6).
7. **Catatan** user.

### 8. Requirement Non-Fungsional

| ID | Kategori | Requirement |
|---|---|---|
| NFR-01 | Performa | Simpan/hitung sesi p95 < 300 ms; daftar sesi p95 < 300 ms untuk 1.000 sesi/workspace |
| NFR-02 | Performa | Ekspor selesai < 3 detik per file di laptop standar; library ekspor di-*lazy load* (tidak menambah bundle awal > 20 KB gzip) |
| NFR-03 | Konsistensi | Angka di modal, PDF, CSV, XLSX, PPTX identik (bersumber dari `results` yang sama) |
| NFR-04 | Keamanan | Auth JWT & RBAC Modul 1; anti-IDOR (sesi workspace lain → 404); validasi Zod; teks user di-escape di UI & ekspor; nama file ekspor disanitasi; rate limit global Modul 1 |
| NFR-05 | Aksesibilitas | Kontras WCAG 2.1 AA; status insight tidak hanya bergantung warna (ikon + teks); setiap grafik punya tabel data alternatif |
| NFR-06 | Bahasa & format | UI Bahasa Indonesia; angka & tanggal format `id-ID`; mata uang IDR |
| NFR-07 | Browser | Sama dengan Modul 1 (NFR-09); modal responsif ≥ 1024 px |
| NFR-08 | Kualitas | Coverage ≥ 80% untuk modul backend `web-reports` dan util format/ekspor frontend |

### 9. Di Luar Scope Modul 2
- Integrasi otomatis GA4/Search Console/CRM/marketplace (README D1).
- Atribusi multi-channel (organik vs iklan vs referral) dan breakdown per produk.
- Target internal & capaian (README D10), forecasting.
- Agregasi otomatis sesi bulanan menjadi tahunan (README D9).
- Narasi/analisis AI (insight bersifat rule-based).
- Jadwal kirim laporan otomatis via email.
- Import data dari file CSV/XLSX.

### 10. Glosarium

| Istilah | Arti |
|---|---|
| Sesi laporan | Satu set input periode + hasil perhitungannya, tersimpan di `web_report_sessions` |
| Lead | Order/form yang masuk lewat website (belum tentu dibayar) |
| Sales | Lead yang closing/lunas |
| Omset (revenue) | Total nominal sales pada periode |
| AOV | Rata-rata nominal per transaksi sales |
| RPV / RPC | Omset dibagi jumlah pengunjung |
| ROAS | Omset dibagi total biaya website (maintenance + iklan) |
| ROI | (Omset − biaya) dibagi biaya, dalam persen |
| Snapshot hasil | Hasil perhitungan yang disimpan bersama sesi beserta `formula_version` |

### 11. Kriteria Rilis Modul 2
1. Semua FR P0 selesai; FR P1 selesai atau disembunyikan.
2. UC-M2-01 s.d. UC-M2-04 lulus UAT; UC-M2-05 lulus jika FR-11 dirilis.
3. Semua kriteria di [TASK_005](M2_TASK_005_QA.md) terpenuhi.
