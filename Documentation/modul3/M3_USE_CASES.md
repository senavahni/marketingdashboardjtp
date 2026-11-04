# Use Cases — Modul 3: Data Scraping & Intelligence

Setiap use case berisi aktor, prasyarat, alur utama, alur alternatif/error, dan hasil akhir. Nama tool, event, dan kode error mengikuti [Kontrak 1.2](M3_MCP_INTEGRATION.md). Kode `E2E-M3-xx` merujuk ke [TASK_006](M3_TASK_006_QA_DEPLOYMENT.md).

| UC | Judul | FR | Task |
|---|---|---|---|
| UC-M3-01 | Membuat job riset dengan agent terpilih | FR-01–08 | 002, 004, 007, 008 |
| UC-M3-02 | Tahap Kumpulkan (MCP) | FR-03–06, FR-09 | 007 |
| UC-M3-03 | Tahap Analisis (MCP + LLM Gateway) | FR-09, FR-15 | 007, 009 |
| UC-M3-04 | Membaca laporan & menjelajahi data mentah | FR-12–15 | 002, 005 |
| UC-M3-05 | Membatalkan & mengulang job | FR-10, FR-11 | 002, 004, 007 |
| UC-M3-06 | Admin memantau AI & Gateway | FR-16, FR-17 | 009 |
| UC-M3-07 | Kegagalan sumber / LLM | NFR-05 | 006, 007, 009 |
| UC-M3-08 | Menyimpan hasil ke Knowledge Base (P1) | FR-19 | 010 |

**Prasyarat umum stack:** Dashboard, MCP :4100 + worker, dan LLM Gateway :8000 berjalan; `.env` backend Dashboard berisi key `dashboard-intel` khusus toolset `intel`; key Gateway per agent sudah diprovisikan oleh MCP ([TASK_009](M3_TASK_009_LLM_GATEWAY_KEYS.md), project Gateway `marketing-mcp`); agent Dashboard `Agent_Researcher` (`mcp_agent_key=researcher`) dan `Agent_Analyst` (`mcp_agent_key=analyst`) aktif di workspace. P0 hanya menjalankan tahap `collect` dan `analyze`.

---

### UC-M3-01: Membuat Job Riset dengan Agent Terpilih
- **Aktor:** Member/Admin/Owner
- **Prasyarat:** Prasyarat umum; untuk X mode browser, halaman Sumber & Koneksi menunjukkan X `available=true` dan `mode=browser` dari `intel_sources_status`.

**Alur utama**
1. User membuka **Riset & Insight** → **+ Job Baru**.
2. **Langkah 1 – Sumber & target:** memilih sumber **X**, keyword `AI marketing tools`, `match = any`, bahasa `id`, kecualikan retweet.
3. **Langkah 2 – Waktu & batas:** rentang 1–30 Okt 2026, `max_items = 500`. Judul otomatis "X · AI marketing tools · Okt 2026".
4. **Langkah 3 – Agent:** tahap *Kumpulkan* menampilkan agent MCP yang cocok melalui pemetaan `mcp_agent_key` (`researcher` terpilih sebagai default workspace); tahap *Analisis* menampilkan `analyst`. Tiap opsi menampilkan route LLM, budget token, dan kapabilitas dari `intel_agents_list`. Agent yang tidak mampu tampil nonaktif dengan alasan kapabilitas collect/analyze tidak terpenuhi. Tahap `index` tidak ditampilkan pada P0.
5. **Langkah 4 – Estimasi:** Dashboard memanggil `intel_job_estimate` dengan `{workspace_id, spec}` → tampil estimasi `seconds`, unit/biaya per sumber, token/biaya per tahap, serta warnings dari MCP.
6. User mencentang "Saya memahami estimasi biaya" → **Jalankan**.
7. Backend membuat `intel_jobs` (UUID lokal dipakai sebagai `dashboard_job_id`, status `queued`) + baris tahap `collect` dan `analyze`, lalu memanggil `intel_job_create` dengan `contract_version=1.2`, `dashboard_job_id`, `workspace_id`, `requested_by`, `spec`, dan `confirm_cost`. MCP mengembalikan `mcp_job_id` (`j_<10 karakter>`); bila respons timeout, backend mengulang payload dengan UUID yang sama karena create idempoten. Daftar job menampilkan baris baru dengan badge **Antre**.

**Alur alternatif / error**
- 2a. URL non-http(s), keyword kosong/melebihi batas → validasi per field; API → 400 `VALIDATION_ERROR`.
- 4a. Tidak ada agent mampu untuk suatu tahap → tombol jalankan dinonaktifkan, pesan "Tambahkan agent dengan kapabilitas collect/analyze yang sesuai di Settings → Agents".
- 5a. MCP tidak bisa dihubungi → estimasi gagal, tombol **Jalankan** nonaktif, toast "MCP tidak tersedia" (502 `MCP_UNAVAILABLE`).
- 7a. MCP menolak agent (`AGENT_NOT_CAPABLE`/`UNKNOWN_AGENT`/`AGENT_INACTIVE`, misalnya profil berubah sejak wizard dibuka) → tampilkan error yang dapat ditindaklanjuti; jangan mengulang dengan `dashboard_job_id` baru.
- 1a. Viewer → tombol **+ Job Baru** tidak tampil; API → 403.

**Hasil akhir:** Job tersimpan di Dashboard & MCP, agent per tahap tercatat. (E2E-M3-01)

---

### UC-M3-02: Tahap Kumpulkan (MCP)
- **Aktor:** MCP (job induk `intel`, worker), Agent_Researcher (aktor & key Gateway)
- **Prasyarat:** UC-M3-01.

**Alur utama**
1. MCP membuat job anak `x_search` dengan parameter sumber; mengirim `intel.job.stage.started {stage: collect, agent_key: researcher}` → Dashboard: status job `collecting`, badge **Mengumpulkan**.
2. Worker mengumpulkan post; setiap ±10% atau 30 detik mengirim `intel.job.progress {stage: collect, done, total}` → bar progres "312 / 500".
3. Selesai: `intel.job.stage.completed {stage, status, stats?, warnings[]}`. Event ini tidak membawa `items_handle`; status, progres, dan handle final dibaca dari `intel_job_get`.

**Alur alternatif / error**
- 2a. Browser profile tidak login / selector berubah → job anak gagal → `intel.job.failed {stage: collect, error.code: SOURCE_UNAVAILABLE}`.
- 2b. Hasil 0 post → tahap selesai dengan `total = 0`; tahap analisis **dilewati** (`skipped`), job `completed` dengan laporan "Tidak ada data pada rentang ini".
- 2c. Beberapa sumber dalam satu job dijalankan berurutan. Sumber gagal menjadi warning `SOURCE_FAILED` dan proses berlanjut bila ada sumber lain yang berhasil; bila semua sumber gagal, job gagal `SOURCE_UNAVAILABLE`.

**Hasil akhir:** Data mentah tersimpan di MCP (`items_handle`), statistik dasar tampil di Dashboard. (E2E-M3-02)

---

### UC-M3-03: Tahap Analisis (MCP + LLM Gateway)
- **Aktor:** MCP, Agent_Analyst, LLM Gateway
- **Prasyarat:** UC-M3-02 selesai dengan data > 0.

**Alur utama**
1. MCP mengirim `intel.job.stage.started {stage: analyze, agent_key: analyst}` → status `analyzing`.
2. MCP menjalankan analisis menggunakan profil agent `analyst` dan konfigurasi model/key di MCP; Dashboard tidak memanggil tool analisis secara terpisah.
3. MCP menyusun hasil laporan, statistik, biaya, dan status job secara internal.
4. `intel.job.completed {summary_preview, totals, cost, partial}`. Dashboard memanggil `intel_job_get` menggunakan `workspace_id` dan `mcp_job_id`, menyimpan hasil lengkap ke Dashboard, status `completed`, toast "Laporan siap".

**Alur alternatif / error**
- 2a. Gateway 429 `quota_exceeded` / key agent dicabut (401) → `intel.job.failed {error.code: LLM_QUOTA_EXCEEDED | LLM_KEY_INVALID, retryable}`; halaman AI & Gateway menandai key bermasalah.
- 3a. Budget token agent habis → `BUDGET_EXCEEDED`; distribusi sentimen yang sudah selesai tetap disimpan sebagai hasil parsial (`partial: true`).
- 3b. JSON sintesis tidak valid 2× → laporan tanpa ringkasan naratif, `warnings: ["SUMMARY_UNAVAILABLE"]`.

**Hasil akhir:** Insight tersimpan; biaya aktual per tahap & per agent tercatat. (E2E-M3-03)

---

### UC-M3-04: Membaca Laporan & Menjelajahi Data Mentah
- **Aktor:** Semua role
- **Prasyarat:** Job `completed`.

**Alur utama**
1. User membuka job → tab **Ringkasan**: ringkasan eksekutif, donut sentimen (mis. 60% positif, 30% netral, 10% negatif) + net sentiment, 5 tren teratas, grafik volume per hari, hashtag & akun teratas, contoh post positif/negatif, kartu **Dikerjakan oleh** (Researcher → Analyst) dan **Biaya** (token, USD).
2. Tab **Data mentah**: tabel 500 post (paginasi 50, server-side), user memfilter sentimen **Negatif** dan mencari kata "mahal".
3. User klik **Ekspor CSV** → file berisi baris sesuai filter terunduh.
4. User klik **Ekspor laporan PDF/XLSX** → memakai util ekspor Modul 2.

**Alur alternatif / error**
- 2a. Data mentah sudah melewati retensi MCP (`RESULT_EXPIRED`) → tab menampilkan "Data mentah sudah kedaluwarsa (retensi N hari); ringkasan tetap tersedia".
- 2b. MCP mati → tab data mentah menampilkan error + **Coba lagi**; tab ringkasan tetap tampil (data di DB Dashboard).

**Hasil akhir:** Laporan dibaca & diekspor. (E2E-M3-04)

---

### UC-M3-05: Membatalkan & Mengulang Job
- **Aktor:** Pembuat job, Admin/Owner

**Alur utama**
1. Saat status `collecting`, user klik **Batalkan** → konfirmasi → status `cancelling`.
2. Backend memanggil `intel_job_cancel`; MCP membatalkan job dan job anaknya, lalu mengirim `intel.job.cancelled`. Bila job sudah terminal, MCP mengembalikan status final tanpa membuat perubahan.
3. User klik **Ulangi** → wizard terbuka terisi parameter job lama (bisa diubah) → job Dashboard dan `dashboard_job_id` **baru**, dengan `retry_of_job_id` menunjuk job lama.

**Alur alternatif / error**
- 2a. Job sudah selesai sebelum cancel diproses → MCP membalas `{cancelled: false, status: completed}`; Dashboard memakai status final dari respons atau `intel_job_get`.
- 2b. Event `cancelled` tidak datang dalam 2 menit → sweeper backend memanggil `intel_job_get` dan menyelaraskan status.

**Hasil akhir:** Job lama tetap tercatat apa adanya; job ulang berjalan terpisah. (E2E-M3-05)

---

### UC-M3-06: Admin Memantau AI & Gateway
- **Aktor:** Admin/Owner workspace

**Alur utama**
1. Admin membuka **Settings → AI & Gateway**.
2. Tabel per agent menampilkan route, prefix key, sumber `agent`/`system`/`env`, status dan penggunaan. Jika key agent belum tersedia, tampilkan sumber fallback aktual (`system` atau `env`) dari MCP; jangan menampilkan secret.
3. Kartu project Gateway `marketing-mcp`: pemakaian 30 hari (dari `intel_llm_status.project`).
4. Halaman **Sumber & Koneksi** menampilkan status X, Threads, Web, Trends dan route LLM sesuai `intel_sources_status`, termasuk mode dan detail dari MCP.

**Alur alternatif / error**
- 2a. Gateway tidak terjangkau → kolom status "Tidak dapat dicek", data pemakaian dari `mcp.llm_calls` tetap tampil.
- 1a. Member/Viewer → menu tidak tampil; API → 403.

**Hasil akhir:** Admin tahu agent mana memakai key apa dan berapa biayanya. (E2E-M3-06)

---

### UC-M3-07: Kegagalan Sumber / LLM
- **Aktor:** Sistem

| Kondisi | Event / respons | Tampilan |
|---|---|---|
| Worker MCP mati saat job berjalan | Heartbeat job kedaluwarsa → MCP menandai gagal `WORKER_LOST` (retryable) | Badge **Gagal**, tombol **Ulangi** |
| Gateway mati | `LLM_UNAVAILABLE` (retryable) | Pesan "Layanan AI tidak tersedia", sumber data tetap tersimpan |
| Kuota Gateway habis | `LLM_QUOTA_EXCEEDED` | Pesan + tautan ke AI & Gateway (admin) |
| Webhook tanpa/beda HMAC | 401 di Dashboard, tidak ada perubahan | — |
| Event terlambat/duplikat | Diabaikan berdasarkan `event_id` & `sequence` | — |

---

### UC-M3-08 (P1): Menyimpan Hasil ke Knowledge Base
Status: belum dapat diaktifkan berdasarkan implementasi MCP saat ini. Kontrak schema 1.2 mengenal `stages.index`, tetapi `intel_job_create` hanya membentuk dan menjalankan tahap `collect` serta `analyze`. Buka kembali use case ini setelah pipeline MCP benar-benar menjalankan dan menguji `index`; jangan mengirim `index.enabled=true` atau menyatakan job berhasil diindeks sebelum itu.
