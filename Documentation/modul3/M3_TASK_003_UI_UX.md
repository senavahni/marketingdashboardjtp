# Task: Rancangan UI/UX Modul 3
**ID:** M3_TASK_003
**Status:** Done (4 Nov 2026) — disetujui PO untuk dilanjutkan ke implementasi; ditambah §B.8 (rancangan semua state) & §B.9 (arah visual)
**Repo:** `marketingdashboardjtp`
**Dependencies:** M3_TASK_000 (bentuk data)
**Estimasi:** 2 person-days
**Acuan:** README K8–K9; pola visual Modul 2 (`frontend/src/components/web-report/`, palet `lib/web-report-theme.ts`)

## Objective
Menetapkan tata letak & perilaku semua layar Modul 3 sebelum implementasi. Mengikuti K9: **tanpa Figma** — keluaran berupa wireframe ASCII/markdown di dokumen ini + komponen yang dipakai ulang. Fokus: data kompleks (sentimen, tren, biaya, agent) terbaca sekilas.

## A. Prinsip
- Hierarki: **status & hasil dulu, detail kemudian**. Laporan dibuka dengan sentimen dominan + 3 tren teratas.
- Satu warna = satu makna (lanjutkan palet Modul 2): sentimen positif teal `#0E9384`, netral abu `#8FA3BF`, negatif oranye-merah `#C2410C`; sumber X navy, Threads ungu, Web biru, Trends amber. Status selalu ikon + teks (tidak hanya warna).
- Agent selalu tampil dengan avatar agent (gaya Modul 1) + route LLM.
- Biaya selalu ditampilkan berdampingan dengan estimasi (estimasi vs aktual).

## B. Layar

### B.1 Daftar job — `/w/:ws/intel`
```
Riset & Insight                                 [Sumber & Koneksi] [+ Job Baru]
[Status ▾] [Sumber ▾]
┌──────────────────────────────────────────────────────────────────────────────┐
│ Judul                     Sumber    Agent            Status         Data  Biaya │
│ X · AI marketing · Okt    X         Researcher→Analyst ◐ Menganalisis 500  $0,09 │
│                                                    ▓▓▓▓▓▓░░ 120/500                │
│ Kopi susu Q4              X Threads Researcher→Analyst ✔ Selesai      1.240 $0,21 │
│ Kompetitor web            Web       Researcher→Analyst ✖ Gagal        —     $0,00 │
└──────────────────────────────────────────────────────────────────────────────┘
```
Badge: Antre (abu, ikon jam) · Mengumpulkan (biru, spinner) · Menganalisis (ungu, spinner) · Mengindeks (teal) · Selesai (hijau ✔) · Gagal (merah ✖) · Dibatalkan (abu ⊘).

### B.2 Wizard job (dialog lebar, 4 langkah, stepper di atas)
1. **Sumber & target** — kartu pilih sumber (X, Threads, Web, Google Trends; Meta tampil nonaktif "Segera"), input keyword sebagai chip, mode web (scrape/crawl), status sumber dari `intel/sources` (mis. "X: mode browser").
2. **Waktu & batas** — rentang tanggal (preset 7/30/90 hari), `max_items` per sumber, bahasa laporan, aspek sentimen (chip, opsional).
3. **Agent** — satu kartu per tahap (*Kumpulkan*, *Analisis*, *Indeks* bila P1 aktif): dropdown agent mampu (avatar, nama, route, budget), agent tidak mampu tampil nonaktif + alasan; default dari `stage-defaults`.
4. **Estimasi & konfirmasi** — durasi, biaya eksternal, token & biaya LLM per tahap/agent, peringatan; checkbox konfirmasi bila `requires_confirmation`; tombol **Jalankan**.

### B.3 Detail job — `/w/:ws/intel/:jobId`
- Header: judul, sumber, rentang, status, tombol Batalkan/Ulangi/Ekspor.
- **Timeline tahap** (P0, pengganti visual 3D): 3 node horizontal Kumpulkan → Analisis → Indeks dengan avatar agent, progres, durasi, biaya per tahap.
- Tab **Ringkasan**, **Data mentah**, **Log** (event job berurutan: waktu, event, pesan).

### B.4 Tab Ringkasan (laporan)
```
┌ Sentimen dominan ─────────┐ ┌ Net sentiment ┐ ┌ Data terkumpul ┐ ┌ Biaya ──────────┐
│ 60% Positif  [donut]      │ │ +0,50         │ │ 500 post       │ │ $0,09 · 38 rb tok│
└───────────────────────────┘ └───────────────┘ └────────────────┘ └──────────────────┘
Ringkasan eksekutif (markdown)            │ Tren & topik teratas (bar berperingkat)
Rekomendasi (≤ 5)                         │ Hashtag teratas · Akun teratas
Volume per hari (stacked per sentimen)    │ Aspek (bila ada): bar 3 warna per aspek
Contoh post positif (3)  |  Contoh post negatif (3)
Google Trends (bila ada): garis minat per keyword + kueri naik
Dikerjakan oleh: Researcher (kumpulkan) → Analyst (analisis)
```

### B.5 Tab Data mentah
Tabel virtual (pola Modul 1, `@tanstack/react-virtual`) kolom: waktu, sumber, akun, teks (2 baris + expand), engagement, sentimen (badge), tautan. Toolbar: cari, filter sumber, filter sentimen, **Ekspor CSV**.

### B.6 Sumber & Koneksi (`/w/:ws/intel/sources`)
Kartu per sumber: mode (API/browser/unofficial/tidak tersedia), detail, terakhir dicek, tombol **Cek ulang**; kartu route LLM (`fast`, `smart`, `embed-default`). Catatan kepatuhan ToS untuk mode browser.

### B.7 Settings → AI & Gateway (admin)
Tabel agent: nama, route, sumber key (Agent/System/Env — Env & System diberi peringatan), prefix key, status, pemakaian 7/30 hari (token, USD), error terakhir. Kartu pemakaian project Gateway per model. Bagian **Default agent per tahap**.

### B.8 Rancangan state (semua layar)
| State | Daftar job | Wizard | Detail / Ringkasan | Data mentah |
|---|---|---|---|---|
| Modul nonaktif (`503 FEATURE_DISABLED`) | Menu sidebar disembunyikan; URL langsung → empty state "belum diaktifkan" + petunjuk `MCP_INTEL_API_KEY` | — | sama | sama |
| Loading | spinner tengah | spinner per langkah; estimasi "Menghitung estimasi…", konten lama diredupkan saat menghitung ulang | spinner halaman | spinner di tabel; "Memuat…" di footer saat halaman berikutnya |
| Kosong | kartu onboarding 3 langkah (Pilih sumber → Tunjuk agent → Baca insight) + CTA; bila karena filter → "Tidak ada job yang cocok" | tidak ada agent mampu → pesan + arahan ke Pengaturan → AI Agents | job belum selesai → "Laporan muncul setelah analisis selesai" | "Tidak ada data yang cocok" |
| Error MCP | empty state + pesan + **Coba lagi** | banner merah di atas langkah; 422 agent → kembali ke langkah Agent | banner error job (kode + pesan, saran Ulangi bila `retryable`) | pesan + **Coba lagi** (Ringkasan tetap jalan) |
| Belum terkirim ke MCP | badge Antre | create gagal setelah job tersimpan → toast + buka job | banner kuning + tombol **Kirim ulang ke MCP** | "tersedia setelah job diterima MCP" |
| Data kedaluwarsa (`410`) | — | — | Ringkasan tetap tampil | pesan retensi + saran **Ulangi** |
| Parsial | — | — | banner kuning "Hasil parsial" + daftar `warnings` | normal |
| Insight belum diambil (`insight_pending`) | — | — | "Laporan sedang disiapkan", diperbarui otomatis | normal |

### B.9 Arah visual (implementasi)
Gaya **editorial** yang sama dengan Modul 2 (eyebrow teal + judul navy besar, latar gradien kertas `#F5F7FA → putih`), dengan aksen gerak yang bermakna: kilau pada progres tahap yang berjalan, denyut pada node timeline aktif & indikator "Sedang berjalan" (keduanya mati pada `prefers-reduced-motion`). Kartu sumber berwarna per sumber (garis tepi = warna sumber), stepper wizard berupa garis progres, kartu KPI dengan aksen atas sesuai makna (warna sentimen dominan, net sentiment ±).

## C. Aksesibilitas & responsif
- Semua grafik punya tabel/teks alternatif; stepper dapat dinavigasi keyboard; fokus kembali ke pemicu saat dialog ditutup.
- `prefers-reduced-motion`: animasi progres & timeline dimatikan.
- Lebar minimum 1024 px (pola Modul 1).

## Acceptance Criteria
1. Dokumen ini disetujui PO sebelum TASK_004/005 dimulai.
2. Semua state (kosong, loading, error MCP, data kedaluwarsa, parsial) punya rancangan.
3. Tidak ada komponen yang menampilkan secret; key hanya sebagai prefix.
