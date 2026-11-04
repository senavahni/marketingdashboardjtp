# Task: Frontend — Laporan Insight & Raw Data Explorer
**ID:** M3_TASK_005
**Status:** To Do
**Repo:** `marketingdashboardjtp`
**Dependencies:** M3_TASK_004
**Estimasi:** 4 person-days
**Acuan:** [TASK_003 §B.4–B.5](M3_TASK_003_UI_UX.md), [Kontrak §2.4 JobView](M3_MCP_INTEGRATION.md#24-jobview)

## Objective
Menampilkan hasil analisis (`intel_insights`) sebagai laporan yang terbaca sekilas, menjelajahi data mentah dari MCP dengan filter server-side, dan mengekspor.

## Pustaka
- Grafik: **Recharts** (sudah dipakai Modul 2).
- Tren/topik: **daftar berperingkat + bar horizontal** (bukan `react-wordcloud` — hanya mendukung React 16).
- Tabel besar: `@tanstack/react-virtual` (pola Modul 1).
- Markdown ringkasan: renderer markdown aman tanpa HTML mentah (heading, bullet, bold, link `http/https` saja).

## Implementasi
- [ ] **Tab Ringkasan**:
  - Kartu KPI: sentimen dominan (+ donut), net sentiment, total data per sumber, biaya aktual vs estimasi.
  - Ringkasan eksekutif & rekomendasi (markdown aman).
  - Tren/topik teratas (bar berperingkat), hashtag & akun teratas.
  - Volume per hari (stacked bar per sentimen, atau per sumber bila tanpa sentimen).
  - Aspek (bar 3 warna per aspek) bila tersedia.
  - Contoh post positif/negatif (kartu dengan tautan asli `rel="noopener noreferrer"`).
  - Google Trends: garis minat per keyword + tabel kueri teratas/naik.
  - Kartu **Dikerjakan oleh**: agent per tahap + token & biaya per tahap.
  - State: parsial (`partial: true` → banner), peringatan (`warnings`), ringkasan tidak tersedia.
- [ ] **Tab Data mentah**:
  - Server-side paginasi (`limit 50`, cursor), cari (debounce 400 ms), filter sumber & sentimen, urutan waktu/engagement.
  - Teks dipotong 2 baris + expand; teks selalu dirender sebagai teks (escape).
  - `410 RESULT_EXPIRED` → pesan retensi; `502` → error + Coba lagi (tab Ringkasan tetap jalan).
- [ ] **Ekspor**:
  - Data mentah: tombol mengunduh `items/export.csv` dengan filter aktif (download via `<a href>` + cookie/token sesuai pola API; tampilkan progres "Menyiapkan…").
  - Laporan: PDF & XLSX memakai util `lib/web-report-export` Modul 2 (model laporan baru `buildIntelReportModel`).

## Test
- [ ] Vitest: pemetaan `JobView` → model tampilan (persen, net sentiment, parsial), renderer markdown menolak HTML/`javascript:`.
- [ ] Playwright: buka laporan job fixture, filter sentimen negatif, ekspor CSV berisi baris sesuai filter.

## Acceptance Criteria
1. UC-M3-04 lulus E2E.
2. Raw data 5.000 item tetap mulus (scroll 60 fps, tanpa crash) karena virtualisasi + paginasi.
3. Angka di laporan, PDF, dan XLSX identik (sumber `intel_insights` yang sama).
4. Tidak ada XSS dari teks post/ringkasan (uji payload `<img onerror>` & `javascript:` link).
