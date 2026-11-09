# Task: Rancangan UI/UX v1.0.0 — Market Intelligence
**ID:** DSH-V1-03
**Status:** Draf untuk persetujuan PO (9 Nov 2026) — implementasi layar dikerjakan oleh DSH-V1-04…13
**Repo:** `marketingdashboardjtp`
**Dependencies:** — (membaca kontrak 1.3 `contracts/1.3/` hanya untuk nama field & state)
**Estimasi:** 3 person-days
**Acuan:** `V1_TASKS.md` (tabel Ringkasan + DSH-V1-03), hub `mcp/documentation/v1.0.0/README.md` (V1-K4…K20, F1–F5), `M3_TASK_003_UI_UX.md` (pola, palet, state), `frontend/src/components/intel/IntelUi.tsx` (komponen yang dipakai ulang)

## Objective
Menetapkan navigasi, pola lintas layar, komponen bersama, dan rancangan semua layar v1.0.0 sebelum implementasi. Seperti Modul 3 (K9): **tanpa Figma**, keluaran berupa wireframe ASCII + aturan perilaku di dokumen ini. Dokumen ini adalah sumber kebenaran untuk DSH-V1-04…13; perubahan layar dicatat di §H.

## A. Prinsip
1. **Bukti dulu, klaim kemudian.** Setiap angka, skor, kebutuhan, kontak, dan klaim strategi bisa ditelusuri ke sumbernya ≤ 2 klik (panel *Bukti & Sumber*, §C.2).
2. **Mesin menyarankan, manusia memutuskan** (V1-K19). Won/lost, approve strategi/kartu/doktrin/konten, dan kontak personal selalu tindakan manusia dan tampil sebagai tombol eksplisit, tidak pernah otomatis.
3. **Ketidakpastian terlihat.** `insufficient_data`, confidence rendah, presisi lokasi kasar, dan model lokal mati ditampilkan — bukan disembunyikan atau dibulatkan.
4. **Satu warna = satu makna** (lanjutan palet Modul 2/3, `lib/web-report-theme.ts`): teal `#0E9384` positif/aksi utama · navy `#0F2340` judul · amber `#D9822B`/`#B45309` perhatian/menunggu · merah-oranye `#C2410C` bahaya/gagal · biru `#1D5FA8` info. Status selalu **ikon + teks**, tidak pernah hanya warna.
5. **Status & hasil dulu, detail kemudian.** Halaman dibuka dengan ringkasan keputusan (apa yang perlu dilakukan), bukan tabel mentah.
6. **Pekerjaan agent selalu terlihat**: avatar agent + route LLM, biaya aktual berdampingan dengan estimasi, dan jeda (pause) tampil sebagai banner yang dapat ditindaklanjuti.
7. **Gaya editorial yang sama** dengan Modul 2/3 (eyebrow teal + judul navy besar, latar `#F5F7FA → putih`). Gerak hanya yang bermakna (kilau progres berjalan, denyut node aktif) dan mati pada `prefers-reduced-motion`.

## B. Navigasi

### B.1 Sidebar baru
Grup "Kerja" yang sudah ada (Beranda, Web Report, Proyek) tidak berubah. Grup baru **Market Intelligence** ditambahkan di bawahnya; tiap item tampil hanya bila modul Intel aktif (`useIntelEnabled`) dan peran memiliki izin baca.

```
┌ Sidebar ───────────────────────┐
│ ◧ Beranda                      │
│ ▤ Web Report                   │
│ PROYEK                         │
│  ▸ …                           │
│ ───────────────────────────── │
│ MARKET INTELLIGENCE            │
│  ◔ Executive Overview          │  /w/:ws/overview
│  ◍ Market Intelligence         │  /w/:ws/market
│  ▣ Company Intelligence        │  /w/:ws/companies
│  ◎ Opportunity Center          │  /w/:ws/opportunities
│  ✦ AI Strategy Studio          │  /w/:ws/strategy
│  ▦ Bank Konten                 │  /w/:ws/content
│  ❏ Knowledge Library           │  /w/:ws/knowledge
│  ☰ Data Management             │  /w/:ws/data
│  ⚙ Agent Workspace      ⓷      │  /w/:ws/agents       (⓷ = approval menunggu)
└────────────────────────────────┘
```
- Lencana angka di **Agent Workspace** = jumlah approval `pending` yang dapat diputuskan peran saat ini (sumber: `GET /approvals`); lencana juga dibaca screen reader ("3 approval menunggu").
- Katalog **Produk** bukan item sidebar sendiri: diakses dari *Data Management → Produk* dan dari wizard (tombol "Kelola produk"). Alasan: produk adalah data master, bukan tujuan kerja harian.
- Sidebar bisa dilipat (perilaku sekarang); saat terlipat hanya ikon + tooltip dengan nama menu.

### B.2 Peta URL & redirect URL lama
| URL | Layar | Catatan |
|---|---|---|
| `/w/:ws/overview` | Executive Overview | |
| `/w/:ws/market` · `/market/social` · `/market/social/:jobId` | Market Intelligence (peta industri, segmen) · Social Listening · laporan | laporan = tampilan Ringkasan Modul 3 + aspek/tema/sinyal |
| `/w/:ws/companies` · `/companies/:id` · `/companies/import` · `/companies/contact-finder` | Daftar+peta · profil · Import · Contact Finder | |
| `/w/:ws/opportunities` · `/opportunities/map` | Opportunity Center (tabel/kanban) · Opportunity Map | |
| `/w/:ws/strategy` · `/strategy/:id` | Strategy Studio | |
| `/w/:ws/content` · `/content/calendar` | Bank Konten (kartu) · kalender | |
| `/w/:ws/knowledge` · `/knowledge/assets/:id` · `/knowledge/doctrine` · `/knowledge/playbooks` · `/knowledge/graph` | Library | |
| `/w/:ws/data` · `/data/products` · `/data/taxonomy` · `/data/quality` · `/data/suppression` · `/data/sources` | Data Management | |
| `/w/:ws/agents` · `/agents/jobs/:jobId` · `/agents/approvals` · `/agents/missions` · `/agents/missions/:id` | Agent Workspace | |

**Redirect (React Router `<Navigate replace>`, tanpa kehilangan parameter):**
| URL lama (Modul 3) | → URL baru |
|---|---|
| `/intel` | `/agents` |
| `/intel/:jobId` | `/agents/jobs/:jobId` |
| `/intel/missions` · `/intel/missions/:missionId` | `/agents/missions` · `/agents/missions/:missionId` |
| `/intel/sources` | `/data/sources` |

Tautan di notifikasi, e-mail, dan `ProductTour` yang masih memakai URL lama harus diperbarui di DSH-V1-13; redirect adalah jaring pengaman, bukan jalur utama.

### B.3 Pola halaman
- **Kerangka** (semua layar): `IntelHeader` (eyebrow, judul, aksi utama di kanan) → baris filter → konten → footer sumber/`as_of`.
- **Tab di dalam halaman** memakai URL (`?tab=`) agar dapat dibagikan dan tombol Back berfungsi.
- **Detail** dibuka sebagai halaman penuh (profil perusahaan, strategi) atau **drawer kanan** 480 px (penjelasan skor, bukti, kandidat) — drawer tidak menggantikan halaman bila konten perlu dibagikan via URL.
- Filter tersimpan: menu **Tampilan tersimpan** (`saved_views`) di baris filter pada Companies, Opportunities, Bank Konten.

## C. Komponen bersama
Semua komponen baru berada di `frontend/src/components/mi/` dan memakai ulang `Card`, `Kpi`, `ProgressBar`, `JobStatusBadge`, `ChipInput`, `AgentChain` dari `components/intel/IntelUi.tsx`.

### C.1 Kartu KPI (`KpiCard`)
```
┌─────────────────────────────┐
│ Perusahaan terkualifikasi ⓘ │  ⓘ → popover definisi
│ 1.284        ▲ +12,4%       │  nilai + delta vs pembanding
│ ▁▂▃▅▆▇ (sparkline)          │  alt: teks "naik 6 periode"
│ 1–31 Okt 2026 · sumber: mi_kpis · as_of 9 Nov 14:02 │
└─────────────────────────────┘
```
Wajib: **definisi** (popover ⓘ, juga `aria-describedby`), **periode**, **sumber** (nama tool MCP), `as_of`. Bila `insufficient_data`: nilai diganti "Data belum cukup" + alasan (mis. "butuh ≥ 30 perusahaan, baru 12") — tanpa angka 0. Delta memakai ikon ▲▼ + teks, bukan warna saja.

### C.2 Panel "Bukti & Sumber" (`EvidencePanel`)
Drawer kanan yang dibuka dari ikon 🔎 di sebelah setiap nilai yang berasal dari mesin (field profil, komponen skor, klaim strategi).
```
┌ Bukti & Sumber ────────────────────────── ✕ ┐
│ Nilai: "SMK Negeri 1 Bandung — telp 022-…"   │
│ ● Tampil di situs resmi (kutipan)            │
│   "…Hubungi kami: (022) …"  [Buka sumber ↗]  │
│   Halaman: /kontak · diambil 7 Nov 2026      │
│ ● Cocok dengan Google Maps                   │
│ Confidence ▓▓▓▓▓▓▓░ 0,82 · Kelengkapan 7/9   │
│ Riwayat perubahan ▾                          │
└──────────────────────────────────────────────┘
```
Isi: kutipan + URL sumber + waktu ambil + metode (JSON-LD, regex, Maps, import, manual) + confidence. Untuk klaim bersitasi-buku: judul buku + halaman (C.4). Tautan sumber eksternal `rel="noopener noreferrer"`.

### C.3 Badge status data
| Badge | Nilai | Tampilan |
|---|---|---|
| Confidence | tinggi ≥ 0,8 · sedang 0,5–0,8 · rendah < 0,5 | bar kecil 4 segmen + teks "Tinggi/Sedang/Rendah" |
| Kelengkapan | n/m field | cincin kecil + "7/9" |
| Presisi lokasi | `exact` · `street` · `city` · `region` · `unknown` | ikon pin berbeda + teks; `city` ke bawah diberi garis putus di peta |
| Asal data | discovery · import · manual | chip abu |
| Kontak | generic · personal (terkunci bila tanpa izin) | chip; personal tanpa izin tampil 🔒 "Disembunyikan (butuh izin)" |

### C.4 Badge sitasi buku (`BookCitation`)
`📖 Blue Ocean Strategy — hlm. 142` (chip kecil, truncate di tengah judul). Klik → popover: judul buku, bab, kutipan ≤ 240 karakter, tombol **Buka kartu pengetahuan** dan **Buka halaman di aset**. Item tanpa sitasi yang seharusnya punya (klaim strategi, item konten) menampilkan chip kuning "Tanpa sitasi".

### C.5 Drawer penjelasan skor (`ScoreExplainDrawer`)
```
┌ Skor 78 · Prioritas Tinggi ───────────── ✕ ┐
│ Model v3 · confidence 0,74   [Bandingkan versi ▾] │
│ Komponen            Bobot  Nilai  Status          │
│ Kecocokan kebutuhan  40%    0,86  ✔ diketahui     │
│ Ukuran organisasi    20%    0,55  ✔ diketahui     │
│ Kesiapan digital     20%    —     ? tidak diketahui │
│ Lokasi/jangkauan     20%    1,00  ✔ diketahui     │
│ ⚠ Info kurang: kesiapan digital (tidak ada situs) │
│ Bukti: [kutipan 1] [kutipan 2]  → EvidencePanel   │
└───────────────────────────────────────────────────┘
```
Komponen `unknown` tidak dihitung sebagai nol; ditandai jelas dan dijumlahkan di "Info kurang". Mode bandingkan = dua kolom versi, selisih disorot dengan ikon ▲▼.

### C.6 Ringkasan mapping kolom (`ColumnMappingSummary`)
```
Kolom file            →  Field kita        Confidence  Transformasi
"Nama Sekolah"        →  name              ▓▓▓▓▓▓▓▓ 0,98  trim
"Alamat Lengkap"      →  address           ▓▓▓▓▓▓▓░ 0,91  —
"Kab/Kota"            →  regency_code      ▓▓▓▓▓░░░ 0,64  cocokkan kode Kemendagri   [Ubah ▾]
"Telp"                →  phone_generic     ▓▓▓▓▓▓░░ 0,77  normalisasi +62
"Catatan"             →  (diabaikan)       —
[Jalankan ulang dengan perubahan]   Peninjauan opsional — tidak memblokir impor
```
Baris confidence < 0,7 diberi latar amber lembut dan diurutkan ke atas; mengubah mapping tidak langsung menjalankan — ada tombol eksplisit.

### C.7 Banner status job
Satu komponen (`JobBanner`) untuk semua jenis jeda/kegagalan, ditampilkan di halaman detail job, di kartu job, dan sebagai notifikasi.

| Kondisi (`pause.reason` / status) | Warna | Teks & aksi |
|---|---|---|
| `captcha` | amber | "Google meminta verifikasi (CAPTCHA). Buka jendela Chrome profil *X*, selesaikan verifikasi, lalu lanjutkan." **[Panduan 3 langkah]** **[Lanjutkan]** |
| `budget` | amber | "Anggaran $2,00 tercapai ($2,03). **[Naikkan batas ke $…]** **[Selesaikan dengan hasil sementara]** **[Batalkan]**" |
| `local_model_unavailable` | amber | "Model embedding lokal (`embed-local`) tidak aktif. Pekerjaan menunggu. Cek status di Data → Sumber. **[Coba lagi]**" — tidak ada tombol "pakai CPU" (V1-K7) |
| `awaiting_review` | biru | "Menunggu review: Analisis produk. **[Buka review]**" |
| `failed` retryable | merah | kode + pesan + **[Ulangi]** |
| `failed` non-retryable | merah | kode + pesan + saran, tanpa Ulangi |
| Belum terkirim ke MCP | kuning | "Job tersimpan tetapi belum diterima MCP. **[Kirim ulang ke MCP]**" |

Banner memakai `role="status"` (non-kritis) atau `role="alert"` (gagal); tombol Lanjutkan hanya aktif bila peran punya izin (`403` → tombol nonaktif + tooltip alasan).

### C.8 Komponen lain
- **`StateView`** — satu komponen untuk lima state generik (§E): `loading | empty | filtered-empty | error | forbidden | disabled`.
- **`ApprovalCard`** — ringkasan review (subjek, agent, ringkasan, dampak, tombol Setujui / Revisi / Tolak + komentar; tombol nonaktif bila `can_decide=false` dengan alasan).
- **`CostPair`** — "estimasi $0,15 · aktual $0,09" dengan bar tipis; melewati estimasi → ikon ⚠.
- **`SourceFooter`** — "Sumber: ci_company_list · as_of 14:02 · cache 60 s" di bawah tabel/grafik.

## D. Layar

> Notasi: `[Tombol]`, `[Filter ▾]`, `◐` berjalan, `✔` selesai, `✖` gagal, `⏸` jeda, `⚠` perhatian. Lebar minimum 1024 px.

### D.1 Executive Overview — `/overview`  (DSH-V1-12)
```
Executive Overview                              [Periode: Okt 2026 ▾] [Bandingkan: bulan lalu ▾]
┌ KPI ─────────────┐┌──────────────────┐┌──────────────────┐┌──────────────────┐
│ Perusahaan 4.120 ││ Terkualifikasi   ││ Opportunity aktif││ Konten terjadwal │
│ ▲ +8%            ││ 1.284 ▲ +12%     ││ 96  ▼ −3         ││ minggu ini: 12   │
└──────────────────┘└──────────────────┘└──────────────────┘└──────────────────┘
┌ Distribusi industri (bar) ──────────┐ ┌ Distribusi provinsi (choropleth mini + tabel) ┐
├ Tren opportunity per status ────────┤ ├ Top 10 opportunity (nama · skor · produk · prioritas) ┤
└ Job aktif (3)  ◐ Cari SMK Jabar 62% · ⏸ Import (CAPTCHA) · ⚠ menunggu review (2) ───────────┘
```
Urutan baca: KPI → apa yang perlu tindakan (job jeda/review) → distribusi. Setiap kartu memakai `KpiCard` (C.1). Mode loading = skeleton per kartu (bukan spinner halaman) agar kartu yang cepat tampil lebih dulu.

### D.2 Market Intelligence — `/market`  (DSH-V1-07/08)
Tab: **Peta industri** · **Segmen** · **Social Listening**.
- **Peta industri:** treemap KBLI/ISIC (ukuran = jumlah perusahaan, warna = skor rata-rata), klik → `Companies` terfilter industri tersebut. Toggle **KBLI 2020 / ISIC Rev.4**. Alternatif tabel selalu tersedia (tombol "Tampilkan sebagai tabel").
- **Segmen:** kartu segmen dari analisis produk (nama, alasan, kebutuhan utama, jumlah perusahaan, `insufficient_data` bila < ambang).
- **Social Listening:** daftar laporan + wizard (produk → **review kata kunci** → platform & periode → estimasi → jalankan). Laporan: sentimen tren, **sentimen per aspek/fitur** (bar 3 warna), share of voice, tema (+ contoh post), market signal, rekomendasi; setiap tema/sinyal punya tautan ke post sumber (EvidencePanel); tombol **Jadikan input strategi**.

### D.3 Company Intelligence — `/companies`  (DSH-V1-07)
Tiga mode lewat kontrol segmented di header: **Daftar · Peta · Terpisah** (daftar + peta berdampingan, default ≥ 1280 px).
```
Company Intelligence          [Import] [Contact Finder] [+ Cari Perusahaan]
[Cari…] [Produk ▾][Industri ▾][Wilayah ▾][Tipe org ▾][Asal ▾][Kelengkapan ≥ ▾][Tampilan tersimpan ▾]
┌ Daftar (virtual) ──────────────────────────┐ ┌ Peta (MapLibre) ──────────────┐
│ Nama            Industri   Kota   Kel. Skor │ │   ●12   ●48   ○ presisi kasar │
│ SMK N 1 Bandung 85410      Bandung 7/9  78  │ │       ●(klaster)  ◌ …         │
│ …                                          │ │ [+][−] © OpenStreetMap        │
└────────────────────────────────────────────┘ └────────────────────────────────┘
Menampilkan 50 dari ±4.120 · SourceFooter
```
- **Daftar:** TanStack Virtual; kolom bisa diatur; baris klik → `/companies/:id`; pilih banyak → *Jadikan opportunity*, *Ekspor*, *Tambah ke target Contact Finder*.
- **Peta (keputusan teknis V1-K20):** MapLibre GL + tile OSM dengan **atribusi tampil permanen** ("© OpenStreetMap contributors"). **Klaster dihitung server** (`ci_geo_clusters` per bbox+zoom) — klien tidak pernah memuat 10.000 titik mentah; titik individual muncul di zoom ≥ 12. Warna titik = prioritas (default) atau industri (toggle); legenda selalu terlihat. Titik dengan presisi `city`/`region` digambar **cincin putus-putus** dengan radius ketidakpastian agar tidak tampak akurat. Pan/zoom memperbarui daftar bila toggle "Filter daftar sesuai peta" aktif. Anggaran performa: ≥ 30 fps pada 10.000 perusahaan di iGPU target (DSH-V1-14).
- **Alternatif peta (a11y):** tab **Tabel wilayah** = ringkasan per provinsi/kab-kota (jumlah, rata-rata skor) yang dapat dinavigasi keyboard; peta sendiri `role="application"` dengan `aria-label` + instruksi keyboard (panah geser, +/− zoom, `Enter` buka klaster terfokus).

**Profil perusahaan — `/companies/:id`**
```
← Daftar   SMK Negeri 1 Bandung   [Instansi pendidikan] [Kel. 7/9] [Presisi: street]
[Jadikan opportunity] [Koreksi] [Gabungkan…] [⋯]
Ringkasan (kutipan situs 🔎)            │ Skor per produk
Industri: 85410 (KBLI) · ISIC 8530       │  Produk A  78 Tinggi  [Jelaskan]
Lokasi: Jl. … (mini-peta) 🔎             │  Produk B  41 Rendah  [Jelaskan]
Produk/layanan · Kebutuhan (kutipan + sumber 🔎) · Sinyal (market_signals)
Framework yang melekat (kg_for_entity) → 📖 chip + tautan ke KG
Kontak: Generic ▸ info@… 🔎 · Personal ▸ 🔒 / [tampilkan (butuh review)]  · Suppression ⓘ
Halaman ter-crawl (8) · Riwayat perubahan
```
- Setiap nilai mesin memiliki ikon 🔎 → `EvidencePanel` (≤ 2 klik ke sumber).
- Kontak personal: tanpa izin `contacts:view_personal` → baris terkunci + jumlah tersembunyi ("1 kontak personal disembunyikan"); dengan izin → tampil dengan status review (`approved`/`pending`); suppression → kontak tidak tampil dan tidak bisa diekspor.
- **Koreksi manual** = dialog per field (nilai baru + alasan wajib) → tercatat di riwayat dengan `actor` manusia. **Merge** = dialog dua kolom (pilih nilai per field) + konfirmasi dampak.

**Import — `/companies/import`**  (DSH-V1-06 / F1b)
Stepper garis progres: **1 File → 2 Mapping → 3 Mode → 4 Proses → 5 Review baris**.
```
1 File:   [ Seret XLSX/CSV ke sini · maks 20 MB / 50.000 baris ]   Sheet: [Data ▾]  Pratinjau 20 baris
2 Mapping: <ColumnMappingSummary C.6>   (agent prospector · confidence rata-rata 0,86)
3 Mode:   (●) Isi database   ( ) Jadikan target pencarian kontak
4 Proses: ▓▓▓▓▓▓░░ 3.100/5.000   Masuk 2.800 · Di-merge 190 · Perlu review 74 · Gagal 36
5 Review: antrean tidak memblokir — baris vs perusahaan mirip → [Merge] [Baru] [Abaikan]
Riwayat batch:  #12 · 5.000 baris · selesai · [Rollback…]
```
Rollback: dialog konfirmasi menampilkan dampak ("Menghapus 2.800 perusahaan baru, mengembalikan 190 hasil merge; 12 perusahaan sudah di-opportunity-kan → *tidak* dihapus"), ketik nama batch untuk konfirmasi.

**Contact Finder — `/companies/contact-finder`**
```
Target (1.000)   [Status ▾][Sektor ▾][Wilayah ▾]   Estimasi: ±1,5 hari · ⏸ CAPTCHA (banner C.7)
Nama              Sektor  Wilayah   Hint        Prio  Status         Kandidat
SMK N 1 …         85410   Bandung   —           ▲ 1   ✔ found        website ✔ telp ✔
SMA Harapan       85420   Cimahi    +kota       ▲ 2   ◐ ambiguous    3 kandidat [Pilih]
SDN 05 …          85310   Garut     [+ hint]    ▲ 3   ✖ not_found    —
```
Status: `queued` (abu, jam) · `found` (hijau ✔) · `ambiguous` (amber, tanda tanya) · `not_found` (merah ✖) · `needs_hint` (biru, ikon info). Aksi baris: atur prioritas, **tambah hint** (kota, alamat, website, kata kunci), **pilih kandidat** (drawer membandingkan kandidat: nama, alamat, domain, jarak, alasan cocok), **jalankan ulang**.

### D.4 Opportunity Center & Map — `/opportunities`  (DSH-V1-10)
Tab: **Tabel · Kanban · Peta**.
- **Tabel skor:** filter prioritas, KBLI, wilayah, org_type, **`insufficient_data`**; kolom skor memakai chip prioritas (Tinggi/Sedang/Rendah) + angka; baris `insufficient_data` tampil "—" + chip "Data kurang" (bukan skor 0). Aksi: **Jalankan scoring** (dialog estimasi), **Jadikan opportunity**, buka **ScoreExplainDrawer** (C.5).
- **Kanban:** kolom `new → qualified → contacted → meeting → proposal → won / lost / dropped`. Seret kartu hanya mengubah status yang diizinkan aturan alur; `won`/`lost` **hanya manusia** dan meminta alasan; setiap perubahan menulis `opportunity_events`. Alternatif keyboard: menu "Pindahkan ke…" di setiap kartu (tidak bergantung drag).
- **Peta:** treemap industri · choropleth/klaster provinsi & kab-kota · heatmap produk × industri → klik sel/wilayah → daftar perusahaan terfilter (drawer). Heatmap: alternatif tabel pivot.

### D.5 AI Strategy Studio — `/strategy`  (DSH-V1-11)
```
Strategy Studio                                              [+ Strategi baru]
Form: Produk ▾ · Segmen/industri ▾ · Tujuan · Periode · Insight yang dipakai [laporan social listening ✔][segmen ✔][opportunity ✔]
      Estimasi: $0,15 · ±4 mnt     [Jalankan]
Hasil v2 · Status: ◔ Menunggu review      [Revisi…] [Setujui] [Tolak]
 ├ Ringkasan  ├ Segmen prioritas  ├ Positioning  ├ Funnel  ├ Channel mix
 ├ Content pillar  ├ KPI  ├ Rencana aksi  └ Asumsi & risiko
 Setiap klaim: [data 🔎 → profil/laporan]  [📖 buku, hlm. N]
Riwayat versi ▾ (v1, v2…) · [Bandingkan]      Setelah approved: [Jadikan aksi/task] [Buat Bank Konten →]
```
- `st_revise`: kolom komentar → versi baru; diff antar-versi per bagian.
- **Aturan keras:** tombol **Buat Bank Konten** nonaktif (tooltip "Strategi harus disetujui dulu") sampai status `approved` — sama dengan validasi backend (422).
- Klaim tanpa sitasi tampil chip kuning "Tanpa sitasi"; tidak bisa disetujui bila ada klaim wajib-sitasi tanpa sumber (peringatan konfirmasi, bukan blokir — keputusan PO di §I).

### D.6 Bank Konten — `/content`  (DSH-V1-11)
Tab: **Kartu · Kalender**.
```
Bank Konten                       [Filter: Platform ▾ Pillar ▾ Funnel ▾ Status ▾]  [+ Generate batch]  [Ekspor ▾]
☐ pilih semua (12)   [Setujui terpilih] [Tolak terpilih]
┌ Instagram · Reel · Pillar: Edukasi · Funnel: Awareness ──────── Skor 8,4 ⓘ ┐
│ Hook: "Sekolahmu kehilangan 3 calon siswa setiap bulan — ini sebabnya"       │
│ Caption (edit inline)…   CTA: Hubungi kami   #pendaftaran #sekolah           │
│ Brief visual: close-up papan pengumuman …                                    │
│ Berdasarkan: 📖 Contagious — hlm. 87 · insight: Tema "biaya"  [Regenerate…]  │
│ Status: ◔ draft   v3 (diedit Rina)         [Setujui] [Tolak] [Jadwalkan…]    │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Edit inline menyimpan **versi** (optimistic locking dengan `version`; konflik → dialog "Dokumen diubah orang lain" + opsi muat ulang/timpa).
- **Regenerate** membuka dialog umpan balik (teks bebas) → item baru versi berikutnya, versi lama tetap bisa dilihat.
- **Skor evaluasi** ⓘ → rubrik + alasan; item yang gagal cek orisinalitas tidak pernah sampai ke daftar (sudah dibuat ulang di MCP).
- **Kalender** (minggu/bulan, per platform dengan warna + ikon platform): seret item `approved` ke tanggal → dialog PIC + jam → membuat task Penjadwalan (Modul 1) dan status `scheduled`; item `scheduled` → **Tandai published** (+ URL). Alternatif keyboard: tombol **Jadwalkan…** pada kartu (dialog tanggal) — drag bukan satu-satunya cara.
- Batas karakter per platform tampil sebagai penghitung (IG 2.200 · TikTok 2.200 · LinkedIn 3.000 · X 280 · Threads 500); melebihi → ⚠ tetapi tidak memblokir penyimpanan draf.

### D.7 Knowledge Library — `/knowledge`  (DSH-V1-09)
Tab: **Aset · Pencarian · Kartu · Doktrin · Playbook · Graf**.
- **Aset:** tombol **Upload PDF** (jenis *Buku* / *Brand guideline*, metadata, centang "Boleh dipakai internal"); progres dua fase real-time — *Mengunggah* (bar byte, kecepatan) lalu *Memproses* (`parsing → chunking → embedding → cards`, via Socket.IO, **tanpa reload**). Status: `uploading · processing · ready · needs_ocr · failed`. `needs_ocr` = banner amber "Halaman scan tidak terbaca; OCR belum tersedia (P2)" + daftar halaman. `failed` menampilkan kode + **[Coba lagi]**.
- **Pencarian buku:** kotak query → potongan + `BookCitation`.
- **Kartu pengetahuan:** filter aset, `card_type` (framework, persuasi, formula copy, format konten, taktik channel, KPI, anti-pola), peran; tiap kartu: isi, sumber halaman, peran, status → **Setujui / Edit / Tolak**; hanya kartu `approved` masuk doktrin (label tegas di header halaman).
- **Doktrin:** pilih peran (analyst/strategist/creative/…) → doktrin aktif + perkiraan token (≈1.500); **bandingkan versi** (diff) → approve versi baru.
- **Playbook:** daftar, detail YAML (editor monospasi dengan validasi), riwayat versi, edit → versi baru, **Jalankan**, daftar `playbook_runs`.
- **KG Explorer (`react-force-graph` 2D, V1-K20):**
```
┌ Cari node… [Tipe: konsep ✔ framework ✔ perusahaan ☐ segmen ☐ tema ☐] [Tabel ⇄ Graf] ┐
│        (graf 2D — warna+bentuk per tipe)       │ Detail node terpilih            │
│                                                │ Definisi · sumber (📖 hlm.)     │
│                                                │ Tetangga (12) · Edge: "mendasari"│
│                                                │ Provenance edge: card X, hlm. 87 │
└────────────────────────────────────────────────┴─────────────────────────────────┘
```
Batas render 500 node (sisanya diklaster/"Muat lebih banyak tetangga"); **setiap edge menampilkan provenance** saat dipilih. Bentuk node berbeda per tipe (bukan hanya warna). **Alternatif graf = daftar** node + tetangga yang dapat dinavigasi keyboard (default untuk `prefers-reduced-motion`; simulasi fisika dimatikan/dibekukan).

### D.8 Data Management — `/data`  (DSH-V1-13)
Tab: **Produk · Taksonomi · Kualitas · Suppression · Sumber**.
- **Produk** (`products:write`): tabel + formulir (nama, kategori, deskripsi, value proposition, target, rentang harga, estimasi nilai deal, **fitur** dapat diurutkan: nama, deskripsi, manfaat); arsip (bukan hapus) bila sudah dipakai analisis.
- **Taksonomi:** pencari KBLI 2020 ↔ ISIC Rev.4 (baca + mapping), tampilan pohon + tabel.
- **Kualitas:** kartu indikator — kelengkapan rata-rata, data kedaluwarsa (stale > N hari), kandidat duplikat (→ antrean merge), baris impor gagal.
- **Suppression:** tabel (domain/e-mail/telepon, alasan, tanggal, siapa); tambah/hapus butuh `contacts:review`; peringatan tegas "Menghapus dari suppression memungkinkan kontak ini muncul lagi".
- **Sumber:** kartu per sumber (Chrome Search, Chrome Maps, X, Threads, Trends, Nominatim, `embed-local`): status (hidup/mati/dibatasi), laju & kuota (mis. "Maps 38/60 per jam"), pause CAPTCHA, terakhir dicek, **[Cek ulang]**; kartu `embed-local` menampilkan "Model lokal hidup/mati" + penjelasan dampak (job bergantung → menunggu). Catatan kepatuhan ToS/robots untuk mode browser.

### D.9 Agent Workspace — `/agents`  (DSH-V1-13, DSH-V1-04)
Tab: **Job · Approval · Misi · Agent**.
```
Agent Workspace          [+ Job baru ▾]  (company_discovery, import, contact_finder, social_listening, book_ingest, scoring, strategy, content_bank)
[Kind ▾][Status ▾][Agent ▾]
Judul                  Kind          Agent           Status           Biaya
Cari SMK Jabar         discovery     analyst→prospector ◐ Enrichment 62%   $0,09 / est. $0,15
Import instansi        import        prospector      ⏸ CAPTCHA  [Lanjutkan]  $0,00
Strategi Q1            strategy      strategist      ◔ Menunggu review [Buka]  $0,11
```
- **Approval (antrean terpadu):** satu daftar untuk 9 jenis subjek (analisis produk, kata kunci, strategi, batch konten, kartu pengetahuan, doktrin, batch kontak, review import, rencana misi). Filter jenis/status; `ApprovalCard` dengan pratinjau subjek **di tempat** (drawer) agar pengguna tidak perlu pindah halaman; keputusan massal hanya untuk jenis yang aman (kartu pengetahuan, item konten). Tombol nonaktif + alasan bila peran tak punya izin (`strategy:approve`, `knowledge:approve`, `content:approve`, `contacts:review`).
- **Detail job** `/agents/jobs/:jobId`: header (judul, kind, status, tombol Batalkan/Ulangi/Lanjutkan/Ekspor) → `JobBanner` → **timeline tahap** (node per tahap dengan avatar agent, route LLM, progres, durasi, `CostPair`) → tab **Ringkasan · Data · Log**. Untuk `social_listening` tab Ringkasan = laporan Modul 3 yang sudah ada; untuk kind lain ringkasan hasil per kind (mis. "112 perusahaan baru, 14 perlu review").
- **Misi:** tetap seperti Modul 3 + budget misi; hanya dipindah URL-nya.
- **Agent:** 6 agent default (`researcher`, `analyst`, `strategist`, `creative`, `curator`, `prospector`); tombol **Tambah agent default** (membuat yang belum ada, idempoten); kartu agent: peran, route, key (hanya prefix), pemakaian 7/30 hari, default untuk tahap. Pengaturan lengkap tetap di *Settings → AI & Gateway* (B.7 Modul 3).
- **Wizard job (semua kind):** langkah *Input → (review bila ada) → Batas & biaya → Estimasi & konfirmasi*; di langkah Batas ada toggle **LLM assist** (default mati; saat dinyalakan tampil tambahan estimasi biaya "+$3–6 / 1.000 baris" dan penjelasan "hanya untuk baris ber-confidence rendah") dan **Budget USD** (kosong = tanpa batas; bila diisi < estimasi → peringatan). Estimasi menampilkan **biaya dan durasi** (rem volume Chrome: "±1,5 hari").

### D.10 Alur F1 — "Cari Perusahaan" (wizard)  (DSH-V1-05)
```
1 Produk & wilayah → 2 Estimasi → 3 Review analisis produk → 4 Progres → 5 Hasil
```
- **1:** produk ▾ (+ "Kelola produk"), wilayah: *Seluruh Indonesia* atau provinsi (multi-pilih), batas jumlah perusahaan.
- **2:** biaya **dan durasi** + peringatan CAPTCHA/laju Chrome; wajib centang konfirmasi bila di atas ambang.
- **3 (review, `product_analysis`):** tabel **industri KBLI/ISIC** (skor, alasan; edit/hapus/tambah), **segmen**, **kebutuhan**, **query pencarian** (daftar yang dapat diubah). Perubahan segmen/query disimpan sebagai revisi dan **memengaruhi query discovery** (AC DSH-V1-05). Tombol **Setujui & lanjut** / **Minta analisis ulang**.
- **4:** timeline tahap (product_analysis → discovery → enrichment → index → fit & score) + `JobBanner`.
- **5:** tautan ke `Companies` terfilter job ini + ringkasan (jumlah perusahaan, % situs valid, % lokasi ≥ city).

## E. Matriks state (semua layar)
Aturan: **tidak ada layar yang menampilkan kosong tanpa alasan**. Setiap sel di bawah adalah rancangan yang harus ada saat implementasi.

| State | Pola tampilan | Aksi |
|---|---|---|
| **Modul nonaktif** (`503 FEATURE_DISABLED`) | Menu sidebar disembunyikan; URL langsung → `StateView disabled`: "Market Intelligence belum diaktifkan" + petunjuk `MCP_INTEL_API_KEY` (hanya untuk admin) | Link ke Pengaturan (admin) |
| **Loading** | Skeleton per blok (kartu/baris/peta abu), bukan spinner layar penuh; konten lama diredupkan saat refetch; `aria-busy="true"` | — |
| **Kosong (data belum ada)** | Kartu onboarding 2–3 langkah khusus layar (mis. Companies: *Tambah produk → Cari perusahaan / Import → Lihat peta*) + CTA utama | CTA sesuai izin |
| **Kosong karena filter** | "Tidak ada yang cocok dengan filter ini" + ringkasan filter aktif | **Reset filter** |
| **Parsial** | Banner kuning "Hasil parsial" + daftar `warnings`; bagian yang tersedia tetap tampil, bagian yang tidak = placeholder bertuliskan alasan | Ulangi bagian itu |
| **`insufficient_data`** | Nilai diganti "Data belum cukup" + alasan & ambang (tidak pernah 0) | Tautan ke cara melengkapi (mis. "Jalankan discovery wilayah ini") |
| **Menunggu review** | Chip biru "Menunggu review" di kartu/baris + `JobBanner` awaiting_review; lencana angka di sidebar | **Buka review** |
| **Pause CAPTCHA** | `JobBanner` amber (C.7) + notifikasi in-app + e-mail/Socket.IO; progres dibekukan (bukan 0); timer "dijeda sejak 14:02" | **Lanjutkan** setelah panduan |
| **Pause budget** | `JobBanner` amber (C.7) | Naikkan batas / selesaikan sementara / batalkan |
| **Model lokal mati** (`local_model_unavailable`) | Banner amber di job terkait + kartu `embed-local` di Data → Sumber berstatus mati; fitur yang butuh embedding (pencarian buku, ingest) menampilkan "Menunggu model lokal" bukan error | Coba lagi / lihat status |
| **Error MCP** (`MCP_ERROR`/5xx) | Blok error lokal (bukan layar penuh): kode + pesan + request id; bagian lain halaman tetap berfungsi | **Coba lagi** |
| **Data kedaluwarsa** (`410`) | Pesan retensi + saran Ulangi; ringkasan yang sudah ada tetap tampil | **Ulangi** |
| **Tidak berizin** (`403`) | Fitur terkunci tampil nonaktif + tooltip izin yang dibutuhkan (mis. "Butuh `strategy:approve`"); halaman penuh → `StateView forbidden` | Hubungi admin |
| **Konflik versi** (`409` edit konten/doktrin) | Dialog "Diubah oleh orang lain" | Muat ulang / timpa |
| **Upload ditolak** | Inline di zona drop: 413 "Maks 100 MB (PDF) / 20 MB (XLSX/CSV)", 415 "Isi file tidak sesuai ekstensi", 429 "Terlalu banyak unggahan, coba lagi dalam N detik" | Pilih file lain |
| **Offline / Socket putus** | Chip "Pembaruan langsung terputus — memuat berkala" di header; polling 15 dtk sebagai cadangan | Muat ulang |

## F. Aksesibilitas (WCAG 2.2 AA)
- **Kontras:** teks ≥ 4,5:1, komponen UI/grafik ≥ 3:1. Teks `inkSoft #5B6474` di atas `paper #F5F7FA` lulus (≈ 5,6:1); **tidak** memakai `#8FA3BF` untuk teks. Warna amber untuk teks memakai `#B45309`, bukan `#D9822B`.
- **Peta:** kontainer `role="application"` + `aria-label`; kontrol zoom/geser berupa tombol nyata (target ≥ 24×24 px, WCAG 2.5.8); klaster dapat difokus (Tab/panah) dan dibuka dengan Enter; **alternatif tabel wilayah** selalu tersedia (D.3); perubahan hasil filter diumumkan via `aria-live="polite"` ("Menampilkan 38 perusahaan").
- **Graf KG:** alternatif daftar node/tetangga (D.7); simpul memiliki label teks; seleksi dapat dilakukan via keyboard; animasi fisika dibekukan untuk `prefers-reduced-motion`.
- **Grafik & heatmap:** setiap grafik punya tabel/teks alternatif (tombol "Tampilkan sebagai tabel") dan ringkasan satu kalimat (`aria-describedby`).
- **Kanban & kalender:** drag-drop **selalu** punya padanan keyboard (menu "Pindahkan ke…", tombol "Jadwalkan…") — WCAG 2.5.7.
- **Wizard/stepper:** langkah dapat dinavigasi keyboard; langkah aktif `aria-current="step"`; galat form dirangkum di atas dan terhubung ke field (`aria-describedby`); fokus berpindah ke judul langkah saat berganti.
- **Dialog & drawer:** fokus terperangkap, `Esc` menutup, fokus kembali ke pemicu; drawer *Bukti & Sumber* tidak menutupi pemicu sehingga fokus tidak hilang di tabel virtual.
- **Tabel virtual:** `role="table"` dengan `aria-rowcount`/`aria-rowindex`; baris yang dirender tetap terhubung agar pembaca layar tahu total baris.
- **Status:** selalu ikon + teks; lencana angka diumumkan; banner `role="status"`/`alert` sesuai tingkat.
- **Gerak:** progres berkilau, denyut node aktif, simulasi graf mati pada `prefers-reduced-motion`.
- **Bahasa:** `lang="id"`; istilah bahasa Inggris yang tak terhindarkan (nama agent) diberi `lang="en"` bila berdiri sendiri.
- **Pengujian:** axe (Playwright) tanpa pelanggaran *serious/critical* pada semua layar di §D (DoD DSH-V1-14); uji manual keyboard-only untuk Companies (peta), Kanban, Kalender, KG.

## G. Responsif & performa UI
- Lebar minimum **1024 px** (pola Modul 1). 1024–1279: peta dan daftar bertumpuk (mode "Terpisah" dinonaktifkan); ≥ 1280: berdampingan.
- Daftar besar selalu virtual (TanStack Virtual) dengan pagination cursor; peta memuat klaster per viewport (debounce 250 ms); KG ≤ 500 node.
- Halaman berat (peta, graf, kalender) di-*lazy-load* per rute (`lazyPage`), dan MapLibre/`react-force-graph` di-*code-split* agar bundel awal tidak bertambah.
- Cache klien: React Query `staleTime` mengikuti TTL backend (KPI 300 s, daftar 60 s, profil 120 s) — tidak ada polling pada data yang sudah punya Socket.IO (job, approval, ingest, impor).

## H. Pemetaan ke task implementasi
| Layar / komponen | Task |
|---|---|
| Sidebar, redirect, `StateView`, `KpiCard`, `EvidencePanel`, badge, `JobBanner`, `CostPair` | DSH-V1-04 (banner/pause), dikerjakan sebagai fondasi di awal DSH-V1-05 |
| Agent (6 default, LLM assist, budget) | DSH-V1-04 |
| Produk + wizard F1 | DSH-V1-05 |
| Import + Contact Finder | DSH-V1-06 |
| Companies (daftar/peta/profil) | DSH-V1-07 |
| Social Listening | DSH-V1-08 |
| Knowledge Library + KG | DSH-V1-09 |
| Opportunity Center & Map | DSH-V1-10 |
| Strategy Studio + Bank Konten | DSH-V1-11 |
| Executive Overview | DSH-V1-12 |
| Agent Workspace + Data Management | DSH-V1-13 |
| axe, E2E, performa peta | DSH-V1-14 |

**Perubahan rancangan** setelah persetujuan wajib dicatat di bagian ini (tanggal, layar, alasan).

## I. Keputusan terbuka untuk PO
1. **Approve strategi dengan klaim tanpa sitasi**: usul = *peringatan + konfirmasi* (bukan blokir keras). Alternatif: blokir.
2. **Penempatan Katalog Produk**: usul = di *Data Management → Produk*, bukan item sidebar. Alternatif: item sidebar sendiri.
3. **Pemindahan URL Intel lama** ke `/agents/*`: usul seperti B.2 dengan redirect; alternatif: pertahankan `/intel` dan hanya menambah menu baru.
4. **Keputusan massal approval**: usul = hanya kartu pengetahuan & item konten; jenis lain wajib satu per satu.

## Acceptance Criteria
1. Dokumen ini disetujui PO sebelum DSH-V1-05…13 mulai dikerjakan (poin §I terjawab).
2. Semua layar di §D punya wireframe dan semua state di §E punya rancangan (kosong, loading, parsial, error, `insufficient_data`, menunggu review, pause CAPTCHA, model lokal mati).
3. Komponen bersama (KPI, Bukti & Sumber, badge confidence/kelengkapan/presisi, drawer skor, badge sitasi buku, ringkasan mapping) terspesifikasi di §C.
4. Keputusan MapLibre (klaster server, atribusi OSM) dan react-force-graph (2D, alternatif daftar) terdokumentasi; alternatif tabel untuk peta & graf ada di §D dan §F.
5. Tidak ada komponen yang menampilkan secret (`lgw_…`, `mcpk_…`); key hanya sebagai prefix; kontak personal tidak tampil tanpa izin.
