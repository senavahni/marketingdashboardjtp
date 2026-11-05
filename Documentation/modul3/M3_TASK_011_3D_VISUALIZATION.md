# Task: Visualisasi 3D Live Data Riset (P2)
**ID:** M3_TASK_011
**Status:** Done, kecuali pengukuran kinerja di mesin target (5 Nov 2026). MCP: `services/intel/projection.py` (`pca_3d`), tool `intel_kb_projection` (chunk pertama tiap item job di koleksi `intel:<workspace_id>`, label tanpa breadcrumb ≤ 60, cache 1 jam setelah job selesai), event `intel.job.progress` tahap index membawa `sample_tokens` (≤ 20 kata, huruf saja; markup/URL/angka dibuang). Dashboard: webhook menerima `sample_tokens` dan meneruskannya sekali lewat `intel.job.updated`; `GET /intel/jobs/:id/projection` (viewer; job tanpa tahap index → titik kosong tanpa memanggil MCP); `components/intel/viz3d/` (IntelFlow3D + panel fallback 2D) dipasang di kartu "Alur kerja agent" lewat tombol **Tampilan 3D** (hanya job dengan tahap index; chunk three.js terpisah ±283 kB gzip, chunk halaman tidak bertambah). Test: MCP integrasi (`test_index_stage_saves_to_kb_scoped_and_purgeable`), unit (`test_intel_projection.py`, sanitasi token), Jest (`intel-event.service.spec.ts`, `intel-agents.spec.ts`), Vitest (`intel-viz3d.test.ts`, `flowEventFromJob`), Playwright E2E-M3-08 (proyeksi + panel 3D/fallback). **Sisa:** ukur ≥ 45 fps & < 150 MB memori pada iGPU target (belum diukur; fallback FPS < 30 tetap aktif). Catatan dev: klik pertama "Tampilan 3D" setelah `npm install` memicu reload Vite (optimasi dependency baru) — hanya di mode dev
**Repo:** `mcp` + `marketingdashboardjtp`
**Dependencies:** M3_TASK_010 (data di Knowledge Base), M3_TASK_004
**Estimasi:** 6 person-days
**Acuan:** konsep visual dari draf awal [`_arsip_draf/M3_TASK_003_UI_UX_MOCKUP.MD`](_arsip_draf/M3_TASK_003_UI_UX_MOCKUP.MD)

## Objective
Menampilkan aliran data riset secara 3D dan interaktif saat job berjalan, sebagai pelengkap (bukan pengganti) timeline tahap 2D:
- **Kiri — Stream:** garis lengkung berwarna per sumber membawa potongan kata/teks yang sedang dikumpulkan.
- **Tengah — Node sumber:** node vertikal Web, X, Threads, Google Trends (Meta bila TASK_012 ada) yang mendistribusikan data ke kanal.
- **Kanan — Jaringan:** cabang berbentuk pohon/bola yang menyebar menjadi awan titik; posisi titik = proyeksi 3D embedding, warna = sentimen.

## MCP
- [ ] Tool `intel_kb_projection(workspace_id, mcp_job_id, limit ≤ 2.000)` → `{points: [{id, x, y, z, source, sentiment, label≤60}], method: "pca", generated_at}`; PCA 3 komponen dihitung di server (numpy) atas embedding job tsb, cache per job.
- [ ] Event `intel.job.progress` tahap `index` menyertakan `sample_tokens` (≤ 20 kata terbaru, sudah disanitasi) untuk animasi stream.

## Dashboard
- [ ] Backend: `GET /intel/jobs/:id/projection` (viewer) → proxy tool di atas.
- [ ] Frontend: komponen `IntelFlow3D` dengan **three.js / @react-three/fiber**, di-*lazy load* hanya saat panel dibuka (tidak menambah bundle awal); instancing untuk ≤ 2.000 titik; orbit/zoom, hover menampilkan label & sentimen.
- [ ] Fallback otomatis ke timeline 2D bila: WebGL tidak tersedia, `prefers-reduced-motion`, atau FPS < 30 selama 3 detik.
- [ ] Batas kinerja mesin target (RAM 16 GB, iGPU): < 150 MB memori tambahan, ≥ 45 fps pada 2.000 titik.

## Acceptance Criteria
1. Selama job berjalan, stream & node bergerak sesuai event progres; setelah selesai, awan titik dapat diputar dan dipilih.
2. Fallback 2D bekerja di ketiga kondisi di atas.
3. Bundle awal & halaman lain Modul 3 tidak bertambah berat (chunk terpisah).
