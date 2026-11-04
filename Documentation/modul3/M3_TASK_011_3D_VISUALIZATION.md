# Task: Visualisasi 3D Live Data Riset (P2)
**ID:** M3_TASK_011
**Status:** To Do
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
