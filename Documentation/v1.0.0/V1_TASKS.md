# Task v1.0.0 — Marketing Dashboard JTP (Market Intelligence)

> Draf brainstorming rev. 2 · 9 November 2026.
> Hub lintas repo (keputusan V1-K1…K21, agent, alur F1–F5, biaya, kriteria rilis): `mcp/documentation/v1.0.0/README.md`.
> Task MCP: `mcp/documentation/v1.0.0/TASKS.md` (`MCP-V1-xx`) · Task Gateway: `llm-genai/docs/v1.0.0/V1_TASKS.md` (`LGW-V1-xx`).
> DoD mengikuti Modul 1 README §5 + Modul 3 README §5, ditambah contract test 1.3 hijau.

## Ringkasan

Navigasi baru mengikuti blueprint §3 + kebutuhan brainstorming:

| Menu | Isi utama | Sumber data |
|---|---|---|
| Executive Overview | KPI + tren, definisi KPI | `mi_kpis` |
| Market Intelligence | Peta industri (KBLI/ISIC), segmen, **social listening** | `mi_*` |
| Company Intelligence | Daftar, profil, kontak (review), **peta lat/lng**, **import XLSX/CSV**, **Contact Finder** | `ci_*` |
| Opportunity Center & Map | Skor, penjelasan, workflow; industri × wilayah × produk | `opp_*`, `mi_*` + `opportunities` |
| AI Strategy Studio | Strategi digital marketing → review → aksi/task | `st_*` + `strategy_docs` |
| **Bank Konten** | Ide & draf post per platform, kalender, review, sitasi buku | `ct_*` + `content_items` |
| Knowledge Library | Upload PDF (≤ 100 MB), knowledge card, doktrin, playbook, KG explorer | `kn_*`, `kg_*`, `pb_*` |
| Data Management | Katalog produk, taksonomi, kualitas data, suppression | Dashboard + `ci_*` |
| Agent Workspace | Semua job, misi, **antrean approval**, job pause (CAPTCHA), budget, 6 agent | Modul 3 (diperluas) |

Kepemilikan data (V1-K3): Dashboard menyimpan yang dikurasi manusia — produk, opportunity, strategi, **bank konten**, approval, metadata upload; data mesin dibaca lewat tool MCP.

## Daftar Task

| ID | Task | Fase | Prio | Est. | Dependensi |
|---|---|---|---|---|---|
| DSH-V1-00 | Kontrak 1.3 (Zod) bersama MCP-V1-00 | 0 | P0 | 1 pd | — |
| DSH-V1-01 | DB Prisma `m4_market_intel` + RBAC | 1 | P0 | 3 pd | 00 |
| DSH-V1-02 | Backend API: produk, intel proxy, upload stream, opportunity, konten, Socket.IO | 1 | P0 | 5 pd | 01, MCP-V1-00 |
| DSH-V1-03 | UI/UX: navigasi baru & rancangan layar | 1 | P0 | 3 pd | — |
| DSH-V1-04 | Agent: 6 agent default, key per agent, LLM assist & job pause | 1 | P0 | 2 pd | 02, MCP-V1-03 |
| DSH-V1-05 | Katalog Produk & wizard "Cari Perusahaan" (F1) | 3 | P0 | 3 pd | 02, 03, MCP-V1-05/09 |
| DSH-V1-06 | Import XLSX/CSV & Contact Finder (F1b) | 3 | P0 | 4 pd | 02, MCP-V1-08 |
| DSH-V1-07 | Company Intelligence: daftar, profil, kontak, peta | 3 | P0 | 5 pd | 02, MCP-V1-07 |
| DSH-V1-08 | Social Listening (F2) | 4 | P0 | 3 pd | 02, MCP-V1-10 |
| DSH-V1-09 | Knowledge Library: upload, card, doktrin, playbook, KG | 2 | P0 | 5 pd | 02, MCP-V1-11..13 |
| DSH-V1-10 | Opportunity Center & Opportunity Map | 5 | P0 | 5 pd | 02, MCP-V1-14/15 |
| DSH-V1-11 | AI Strategy Studio & Bank Konten (F5) | 5 | P0 | 5 pd | 10, MCP-V1-16 |
| DSH-V1-12 | Executive Overview | 5 | P0 | 2 pd | MCP-V1-15 |
| DSH-V1-13 | Agent Workspace & Data Management | 5 | P0 | 3 pd | 02, 04 |
| DSH-V1-14 | QA, E2E stack nyata, rilis v1.0.0 | 6 | P0 | 4 pd | semua |

**Total ±53 pd.** Jalur kritis: 00 → 01 → 02 → 06/07 → 10 → 11 → 14.

### Status (9 Nov 2026)
| ID | Status | Catatan |
|---|---|---|
| DSH-V1-00 | Selesai | `contracts/1.3/` + schema Zod + contract test; mock MCP 1.3 (`backend/src/scripts/mock-mcp-13.ts`) |
| DSH-V1-01 | Selesai | Migrasi `20261109000000_m4_market_intel`, seed 2 produk, RBAC baru (`common/constants/permissions.ts`) |
| DSH-V1-02 | Selesai | Modul `market-intel` + `intel/v13`; Jest 393 lulus; smoke API nyata 30/30 (DB scratch + mock MCP) |
| DSH-V1-03 | Selesai (menunggu persetujuan PO atas §I) | [V1_TASK_003_UIUX.md](V1_TASK_003_UIUX.md) |

### Urutan mulai di repo ini
1. **DSH-V1-00** kontrak 1.3 (bersama MCP).
2. **DSH-V1-03** UI/UX — bisa dimulai hari pertama, tanpa dependensi.
3. **DSH-V1-01** DB Prisma (produk & fitur dibutuhkan MCP untuk analisis produk).
4. **DSH-V1-02** API dengan **mock MCP** (Modul 3 `M3_TASK_009_MOCK`) agar tidak menunggu fitur MCP.
5. Fitur UI pertama: **DSH-V1-06 Import & Contact Finder** (data instansi sudah ada) dan **DSH-V1-09 Knowledge Library**.

---

## DSH-V1-00 — Kontrak 1.3

**Checklist:** sinkron fixture `contracts/1.3/`; schema Zod untuk `mi_*`, `ci_*`, `opp_*`, `st_*`, `ct_*`, `kn_*`, `kg_*`, `pb_*` + event baru (`intel.job.paused`, `ci.import.status`, `ct.batch.ready`, dst.); klien MCP menolak respons tidak sesuai schema; Jest contract test.

**Acceptance Criteria:** fixture 1.3 lulus di Jest; Modul 1–3 tidak berubah perilaku.

---

## DSH-V1-01 — DB Prisma `m4_market_intel` + RBAC

| Tabel | Kolom kunci |
|---|---|
| `products` | `name`, `slug`, `category`, `description`, `value_proposition`, `target_notes`, `price_range`, `deal_value_estimate?`, `status` |
| `product_features` | `product_id`, `name`, `description`, `benefit`, `order_index` |
| `opportunities` | `product_id`, `mcp_company_id`, `company_name_cache`, `latest_score`, `priority`, `score_model_version`, `status` (new/qualified/contacted/meeting/proposal/won/lost/dropped), `owner_user_id`, `next_action_at`, `notes`; UNIQUE(ws, product, company) |
| `opportunity_events` | riwayat status/catatan/skor/aksi (`actor_type` user/agent) |
| `marketing_actions` | `opportunity_id?`, `strategy_doc_id?`, `content_item_id?`, `title`, `channel`, `status`, `task_id?`, `result` |
| `strategy_docs` | `product_id`, `mcp_report_id`, `title`, `version`, `status` (draft/in_review/approved/rejected) |
| `content_items` | `strategy_doc_id`, `mcp_batch_id`, `platform` (instagram/tiktok/linkedin/x/threads), `format`, `pillar`, `funnel_stage`, `segment`, `hook`, `caption`, `cta`, `hashtags[]`, `visual_brief`, `framework_refs jsonb`, `insight_refs jsonb`, `eval_score`, `status` (draft/approved/rejected/scheduled/published), `scheduled_at`, `published_url`, `task_id?`, `version`, `edited_by` |
| `approvals` | `subject_type` (product_analysis/keyword_set/strategy/content_batch/knowledge_card/doctrine/contact_batch/import_review/mission_plan), `subject_ref`, `status`, `requested_by_agent`, `decided_by`, `comment` |
| `upload_refs` | `kind` (pdf/xlsx/csv), `mcp_upload_id`, `filename`, `size`, `uploaded_by`, `purpose` (book/brand/import), `status_cache` |
| `saved_views` | `user_id`, `page`, `name`, `filters` |

**RBAC baru:** `products:write`, `opportunities:write`, `contacts:view_personal`, `contacts:review`, `knowledge:upload`, `knowledge:approve`, `data:import`, `strategy:approve`, `content:approve`. Kontak personal tidak disimpan di DB Dashboard.

**Acceptance Criteria:** migrasi bersih; seed 2 produk dengan fitur; MCP dapat membaca produk lewat read model.

---

## DSH-V1-02 — Backend API

**Spesifikasi**
- Produk CRUD; intel proxy tipis per layar (`ci_company_list`, `ci_geo_clusters`, `mi_kpis`, `opp_list`, …) dengan cache Redis 60–300 s.
- Job: `POST /workspaces/:ws/intel/jobs` menerima kind baru + `llm_assist` + `budget_usd`; review stage → `POST .../jobs/:id/review` (+ `approvals`); **resume** job pause → `POST .../jobs/:id/resume`.
- **Upload streaming** `POST .../uploads` → MCP `POST /uploads`: PDF ≤ 100 MB, XLSX/CSV ≤ 20 MB; cek magic bytes di chunk pertama; tanpa buffer penuh; rate limit per user.
- Opportunity workflow + `opportunity_events`; strategi & **konten**: simpan batch `ct.batch.ready` ke `content_items`, edit, approve, jadwalkan → task Modul 1.
- Ekspor via `data_export` MCP (sudah menyaring kontak personal/suppressed & escape formula).
- Webhook/Socket.IO untuk semua event baru (room workspace).

**Pengujian:** Jest + mock MCP; upload 100 MB lulus / 101 MB ditolak tanpa RSS > 200 MB; permission per endpoint.

**Acceptance Criteria:** Swagger lengkap; tidak ada `lgw_…`/secret di respons; kontak personal hanya untuk peran berizin.

---

## DSH-V1-03 — UI/UX

**Checklist**
- [ ] Sidebar baru (tabel Ringkasan); URL Intel lama di-redirect.
- [ ] Rancangan semua layar dengan state: kosong, loading, parsial, error, `insufficient_data`, menunggu review, **pause CAPTCHA**, model lokal mati.
- [ ] Komponen bersama: kartu KPI (definisi/periode/sumber), panel "Bukti & Sumber", badge confidence/completeness/presisi lokasi, drawer penjelasan skor, **badge sitasi buku** (judul, halaman), **ringkasan mapping kolom**.
- [ ] Peta **MapLibre GL** + tile OSM (atribusi) dengan klaster server-side; graf **react-force-graph** (2D).
- [ ] Aksesibilitas WCAG 2.2 AA (alternatif tabel untuk peta & graf).

---

## DSH-V1-04 — Agent, key, LLM assist, job pause

**Spesifikasi**
- "Tambah agent default" membuat 6 agent: `researcher`, `analyst`, `strategist`, `creative`, `curator`, `prospector` (nama Inggris) + default per tahap untuk job kind baru.
- Pengaturan → AI & Gateway: key per agent (rotasi yang sudah ada), biaya per agent.
- Wizard semua job: toggle **LLM assist** (default mati, tampilkan tambahan biaya estimasi), `budget_usd`.
- Banner & notifikasi saat job `paused` (`captcha`/`budget`/`local_model_unavailable`) dengan instruksi dan tombol lanjut.

**Acceptance Criteria:** semua kind job dapat dijalankan dengan agent default tanpa konfigurasi manual.

---

## DSH-V1-05 — Katalog Produk & wizard F1

**Spesifikasi:** halaman Produk (fitur, value proposition); wizard: produk + wilayah (Indonesia / provinsi) + batas → estimasi (biaya **dan durasi**, karena rem volume Chrome) → jalankan → **review analisis produk** (industri KBLI/ISIC, segmen, kebutuhan, query; edit/hapus/tambah) → progres tahap → hasil terfilter di Company Intelligence.

**Acceptance Criteria:** E2E produk → review → perusahaan di daftar & peta; edit segmen memengaruhi query discovery.

---

## DSH-V1-06 — Import XLSX/CSV & Contact Finder (F1b)

| Dependensi | 02, MCP-V1-08 | Referensi | F1b |
|---|---|---|---|

**Spesifikasi — Import**
1. Upload file (drag-drop, ≤ 20 MB) → pilih sheet.
2. **Ringkasan mapping otomatis** dari agent `prospector`: tabel "kolom file → field kita" + confidence + transformasi; pengguna **tidak wajib** meninjau, tetapi bisa mengubah lalu menjalankan ulang.
3. Pilih mode: **Isi database** atau **Jadikan target pencarian kontak**.
4. Progres (`ci.import.status`): baris masuk / di-merge / perlu review / gagal.
5. **Antrean review baris** (tidak memblokir): bandingkan dengan perusahaan yang mirip, pilih merge/baru/abaikan.
6. Riwayat batch + tombol **Rollback** (dengan konfirmasi dan ringkasan dampak).

**Spesifikasi — Contact Finder**
- Daftar target: nama, sektor (KBLI), wilayah, hint, prioritas, status (`queued/found/ambiguous/not_found/needs_hint`), kandidat.
- Aksi: atur prioritas, tambah hint (kota, alamat, website, kata kunci), **pilih kandidat** untuk `ambiguous`, jalankan ulang baris.
- Estimasi waktu proses (mis. "±1,5 hari untuk 1.000 baris") dan status pause CAPTCHA.

**Acceptance Criteria:** file instansi (nama + alamat) ter-import tanpa pengaturan manual; rollback mengembalikan data; kriteria rilis F1b.

---

## DSH-V1-07 — Company Intelligence

**Spesifikasi**
- Daftar (TanStack Virtual): nama, `org_type`, KBLI/ISIC, kab/kota & provinsi, completeness, skor tertinggi, asal (discovery/import/manual), diperbarui; filter + saved views.
- Peta (MapLibre): klaster `ci_geo_clusters`, warna prioritas/industri, badge presisi lokasi, alternatif tabel.
- Profil: ringkasan (kutipan situs), industri, lokasi, produk/layanan, kebutuhan (kutipan + sumber), sinyal, skor per produk, **framework yang melekat** (`kg_for_entity`), halaman ter-crawl, riwayat, panel Bukti & Sumber per field.
- Kontak: generic tampil; personal sesuai izin + review; suppression.
- Koreksi manual & merge.

**Pengujian:** Vitest; Playwright filter + peta + profil; 10.000 perusahaan → peta ≥ 30 fps di iGPU target.

**Acceptance Criteria:** setiap nilai dapat ditelusuri ke sumber ≤ 2 klik; kontak personal tersembunyi untuk peran tanpa izin.

---

## DSH-V1-08 — Social Listening (F2)

**Spesifikasi:** wizard produk → review kata kunci (`mi_keyword_expand`) → platform & periode → jalankan; laporan: tren sentimen, **sentimen per aspek/fitur**, share of voice, tema + contoh post, market signal, rekomendasi; tautan sinyal → profil perusahaan; tombol "Jadikan input strategi".

**Acceptance Criteria:** E2E produk → laporan; setiap tema/sinyal membuka post sumber.

---

## DSH-V1-09 — Knowledge Library

**Spesifikasi**
- Upload PDF (≤ 100 MB) dengan jenis **Buku** atau **Brand guideline**, metadata, centang hak pakai internal; progres upload & ingest real-time.
- Daftar aset: status, halaman, chunk, `needs_ocr`, error + aksi.
- Pencarian buku: potongan + sitasi.
- **Knowledge card:** daftar per aset & `card_type`, format kartu, sumber halaman, peran (analyst/strategist/creative), approve/edit/reject.
- **Doktrin:** lihat doktrin aktif per peran, bandingkan versi, approve versi baru.
- **Playbook:** daftar, detail YAML, riwayat versi, edit → versi baru, jalankan, lihat `playbook_runs`.
- **KG Explorer** (react-force-graph): cari node, filter tipe (konsep, framework, perusahaan, segmen, tema…), klik → definisi, sumber, tetangga; alternatif daftar.

**Acceptance Criteria:** buku 100 MB → `ready` tanpa reload; hanya card approved yang masuk doktrin; setiap edge menampilkan provenance.

---

## DSH-V1-10 — Opportunity Center & Map

**Spesifikasi:** tabel skor + filter (priority, KBLI, wilayah, org_type, `insufficient_data`); jalankan scoring; "jadikan opportunity"; drawer penjelasan (komponen, bobot, known/unknown, bukti, info kurang, confidence, versi, bandingkan versi); kanban workflow (won/lost hanya manusia); Map: treemap industri, choropleth/klaster provinsi & kab-kota, heatmap produk × industri → klik → daftar perusahaan.

**Acceptance Criteria:** kriteria rilis F3 terlihat di UI; status tercatat di `opportunity_events`.

---

## DSH-V1-11 — AI Strategy Studio & Bank Konten (F5)

**Spesifikasi — Strategy Studio**
- Form: produk, segmen/industri, tujuan, periode, insight yang dipakai (laporan social listening, segmen, opportunity).
- Hasil: ringkasan, segmen prioritas, positioning, funnel, channel mix, content pillar, KPI, rencana aksi, asumsi & risiko — setiap klaim dengan sitasi (data → profil/laporan; buku → card/halaman).
- Review → `st_revise` (versi) → approve → aksi ke task; tombol **"Buat Bank Konten"** dari strategi approved.

**Spesifikasi — Bank Konten**
- Generate batch (jumlah, platform IG/TikTok/LinkedIn/X/Threads, periode) → progres → batch tampil sebagai kartu: platform, format, pillar, funnel, hook, caption, CTA, hashtag, brief visual, **"Berdasarkan: <card> — <buku>, hlm. N"**, insight, skor evaluasi + alasan.
- Edit inline (versi tersimpan), regenerate dengan feedback, approve/reject per item atau massal.
- **Kalender konten** (minggu/bulan) per platform; jadwalkan → task Penjadwalan (Modul 1/3) untuk PIC; tandai published + URL.
- Filter pillar/platform/status; ekspor CSV/XLSX/PPTX (re-use ekspor Modul 2).

**Acceptance Criteria:** bank konten tidak dapat dibuat tanpa strategi approved; item approved → task terjadwal; kriteria rilis F5.

---

## DSH-V1-12 — Executive Overview

KPI (blueprint §3.1) dari `mi_kpis` dengan periode & pembanding; distribusi per industri & provinsi; tren opportunity; top 10 opportunity; status job aktif; **konten terjadwal minggu ini**. Setiap kartu menampilkan definisi, periode, sumber, `as_of`.

**Acceptance Criteria:** angka sama dengan tool MCP; dimuat < 2 s dengan cache hangat.

---

## DSH-V1-13 — Agent Workspace & Data Management

- Agent Workspace: job semua kind (filter kind/status/agent), tahap & log, biaya per tahap/agent, **antrean approval terpadu** (analisis produk, kata kunci, strategi, batch konten, knowledge card, doktrin, kontak personal, review import, rencana misi), job pause, retry, budget misi.
- Data Management: produk, taksonomi KBLI/ISIC (baca + mapping), indikator kualitas (completeness, stale, kandidat duplikat), suppression list, status sumber (Chrome/Maps: laju, kuota, pause; `embed-local`: hidup/mati).

**Acceptance Criteria:** semua item menunggu review dapat diselesaikan dari satu antrean.

---

## DSH-V1-14 — QA, E2E, rilis v1.0.0

**Checklist**
- [ ] Vitest + Jest coverage ≥ 80% modul baru.
- [ ] Playwright stack nyata: E2E-V1-F1, F1b (import + Contact Finder + rollback), F2, F3, F4 (upload PDF → card → doktrin), F5 (strategi → bank konten → kalender → task).
- [ ] RBAC kontak personal, ekspor, upload 101 MB, a11y (axe), performa peta 10.000 titik.
- [ ] Pemindaian secret & dependensi; `package.json` backend/frontend → `1.0.0`, `CHANGELOG`, tag `v1.0.0`.
- [ ] Perbarui `KONFIGURASI_3_PROJECT.md` (agent & key baru, upload, profil Gateway `remote-embed-gpu`).

**Acceptance Criteria:** kriteria rilis lintas repo lulus bersama MCP-V1-19 & LGW-V1-07.
