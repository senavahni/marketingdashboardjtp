# Task: Collector Meta — Facebook & Instagram (P2, di luar rilis pertama)
**ID:** M3_TASK_012
**Status:** Backlog
**Repo:** `mcp`
**Dependencies:** M3_TASK_007
**Estimasi:** 5 person-days (di luar waktu review aplikasi Meta)
**Acuan:** README K1

## Objective
Menambahkan sumber `meta` ke toolset `intel` sehingga job riset bisa memakai konten publik Facebook Page & Instagram Business.

## Catatan kelayakan (harus diputuskan sebelum mulai)
- Pencarian keyword publik lintas Facebook/Instagram **tidak tersedia** di Graph API untuk aplikasi umum. Yang realistis: konten & komentar **Page/akun milik sendiri atau yang mengizinkan**, Instagram Hashtag Search (perlu Instagram Business account, kuota hashtag terbatas per minggu), dan Meta Content Library (akses riset terbatas).
- Butuh aplikasi Meta + App Review untuk permission terkait (mis. `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`). Waktu review di luar kendali tim.
- Scraping browser Facebook/Instagram berisiko tinggi terhadap ToS dan pemblokiran akun → **tidak direkomendasikan**.

## Lingkup bila disetujui
- [ ] `services/collectors/meta_api.py` (Graph API) + handler `MetaSearchHandler`: sumber `{type: "meta", mode: "page_posts"|"ig_hashtag", page_ids?[], hashtags?[], max_items ≤ 1.000}`.
- [ ] Token disimpan di MCP (`META_ACCESS_TOKEN` atau `mcp.llm_credentials`-style terenkripsi), status di `intel_sources_status`.
- [ ] Kontrak 1.3 (aditif): tipe sumber `meta` di JobSpec, fixture, kapabilitas `collect` butuh toolset `social`.
- [ ] Dashboard: kartu sumber Meta aktif di wizard (saat ini tampil "Segera").

## Acceptance Criteria
1. Job dengan sumber `meta` (page milik sendiri) mengumpulkan post + komentar dan ikut dianalisis sentimen.
2. Tanpa token/izin, sumber tampil "tidak tersedia" dengan alasan jelas; wizard tidak bisa memilihnya.
