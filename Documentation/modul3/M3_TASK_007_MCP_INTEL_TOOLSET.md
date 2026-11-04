# Task: MCP — Toolset `intel` & Orchestrasi Job Riset
**ID:** M3_TASK_007
**Status:** Done (4 Nov 2026) — migrasi `0003_intel` diterapkan; 25 unit + 9 integration test intel, seluruh suite MCP hijau (475 unit, 118 integration). Catatan keputusan: [Kontrak §7](M3_MCP_INTEGRATION.md#7-catatan-implementasi-task_000--task_007-4-nov-2026)
**Repo:** **`mcp`** (github.com/senavahni/mcp-custom-by-fr)
**Dependencies:** M3_TASK_000
**Estimasi:** 5 person-days
**Acuan:** [Kontrak 1.2 §2–3, §5](M3_MCP_INTEGRATION.md), MCP `documentation/MCP_SPEC.md`, `documentation/dev-guide-tools.md`

## Objective
Menambahkan toolset `intel` yang memungkinkan Dashboard menjalankan job riset multi-tahap **tanpa** membuka toolset internal (`social`, `web`, `analysis`, …) ke Dashboard. MCP merantai tahap memakai collector & analisis yang **sudah ada**, mengirim event `intel.job.*` berurutan, dan menyimpan data mentah sendiri.

## A. Struktur kode (usulan)
```
mcp_marketing/
  schemas/intel.py                 # Pydantic kontrak 1.2 (TASK_000)
  tools/intel.py                   # registrasi 8 tool intel_*
  services/intel/
    capabilities.py                # toolsets profil → {collect, analyze, index}
    estimate.py                    # estimasi per sumber + LLM per tahap
    orchestrator.py                # buat job induk & anak, transisi status
    synthesize.py                  # sampel T5 + 1 panggilan smart (JSON) → summary/topics/recommendations
    view.py                        # rakit JobView dari job induk/anak + result store + llm_calls
    events.py                      # builder event intel.job.* (sequence per job)
  worker/handlers/intel.py         # IntelPipelineHandler, IntelSynthesizeHandler
migrations/versions/<rev>_intel.py
```

## B. Data (schema `mcp`)
- [ ] `mcp.intel_jobs`: `id` (= id job induk `mcp.jobs`), `dashboard_job_id UUID UNIQUE`, `workspace_id UUID NOT NULL`, `client_id`, `spec JSONB`, `stage_agents JSONB` (`{collect: "researcher", analyze: "analyst", index?: …}`), `status`, `event_sequence INT`, `items_handle`, `result JSONB`, `cost JSONB`, `error JSONB`, timestamps.
- [ ] `mcp.webhook_outbox`: tambah `job_id` + kunci urutan `(job_id, sequence)`; worker outbox menjamin satu in-flight per `run_id` **atau** per `job_id`.
- [ ] `mcp.llm_calls`: tambah `agent_key`, `job_id`, `stage`, `cost_usd` (dipakai juga oleh TASK_009).

## C. Tool (`toolset = "intel"`)
- [ ] `intel_agents_list`, `intel_sources_status` (memakai `browser_profile_check` ringan + konfigurasi X/Threads/Trends + `GET /v1/models` Gateway dengan key `system`; cache 60 s).
- [ ] `intel_job_estimate`: per sumber memakai fungsi estimasi yang sudah dipakai `x_search`/`threads_search`/`web_*`/`trends_*`; LLM per tahap = heuristik (jumlah item × token rata-rata sampel + sintesis) × harga route dari konfigurasi; `requires_confirmation` bila `usd_external > 0` atau `usd_llm > INTEL_CONFIRM_USD` (default 1).
- [ ] `intel_job_create`:
  1. Validasi spec (Pydantic) + `contract_version` 1.x.
  2. Validasi agent tiap tahap: profil ada (`UNKNOWN_AGENT`), aktif (`AGENT_INACTIVE`), kapabilitas sesuai (`AGENT_NOT_CAPABLE`).
  3. Cek sumber tersedia (`SOURCE_UNAVAILABLE`) & konfirmasi biaya (`COST_CONFIRMATION_REQUIRED`).
  4. Idempoten per `dashboard_job_id` (create ulang → kembalikan `mcp_job_id` yang sama).
  5. Simpan `mcp.intel_jobs` + enqueue job induk `intel_pipeline`.
- [ ] `intel_job_get`, `intel_job_cancel` (set `cancel_requested` induk + anak; idempoten), `intel_items` (proxy `data_get` atas `items_handle` dengan filter `source/sentiment/q`, `limit ≤ 100`; `RESULT_EXPIRED` bila handle hilang), `intel_llm_status` (TASK_009).
- [ ] Setiap tool mewajibkan `workspace_id` dan membandingkannya dengan `mcp.intel_jobs.workspace_id` (beda → `NOT_FOUND`).
- [ ] Klien `dashboard-intel` dibuat via `POST /admin/clients` (`toolsets: ["intel"]`); toolset `intel` **tidak** ditambahkan ke profil agent.

## D. Pipeline (`IntelPipelineHandler`)
```
queued
 → stage collect  (agent collect): per sumber buat job anak memakai handler yang ada
       x → XSearchHandler · threads → ThreadsSearchHandler · web → WebScrape/WebCrawlHandler · trends → Trends*Handler
       gabungkan hasil teks ke satu result set `intel_items` (kolom: id, source, created_at, author, text, url, engagement, lang)
       progres = Σ done / Σ total anak (event tiap ≥ 10% atau ≥ 30 s)
 → total == 0 → stage analyze skipped → completed
 → stage analyze  (agent analyze): SentimentAnalyzeHandler atas items_handle (aspects, method)
       + statistik Python (volume per hari, hashtag, akun) + IntelSynthesizeHandler (route agent, JSON mode, ≤ 2 percobaan)
       (market_analyze ditunda — lihat Kontrak §7)
 → stage index    (P1, TASK_010)
 → completed / failed / cancelled
```
- [ ] Setiap panggilan LLM dalam tahap memakai **konteks agent tahap** (`agent_key`, route profil, budget `run_token_budget`) → key Gateway dipilih TASK_009; header `X-Caller-Agent`, `X-Caller-Task=intel:<job>:<stage>`.
- [ ] Budget habis → `BUDGET_EXCEEDED`, simpan hasil parsial (`partial: true`).
- [ ] Error Gateway dipetakan sesuai [Kontrak §4](M3_MCP_INTEGRATION.md#4-llm-gateway--key-per-agent--atribusi).
- [ ] Cancel dicek di antara langkah & sebelum setiap panggilan LLM.
- [ ] Heartbeat kedaluwarsa → `WORKER_LOST` (retryable) via handler maintenance yang ada.
- [ ] Konten eksternal dibungkus `<untrusted_content>` saat dikirim ke LLM (aturan MCP_SPEC §8).

## E. Test (pytest)
- [ ] Unit: kapabilitas, estimasi, transisi status, builder event (`sequence` ketat), pemetaan error Gateway.
- [ ] Integration: pipeline penuh dengan collector & Gateway di-mock (respx) — sukses, 0 item, satu sumber gagal (warning), cancel di tengah, budget habis, key invalid.
- [ ] Contract: output tool & event vs fixture TASK_000.
- [ ] `tools/list` dengan key `dashboard-intel` hanya mengembalikan 8 tool `intel_*`.

## F. Dokumentasi MCP
- [ ] `documentation/MCP_SPEC.md`: §0 tambah toolset `intel`, §4.11 katalog, §5 kontrak 1.2.
- [ ] `documentation/tasks/TASK-28-intel-toolset.md` (merujuk dokumen ini).

## Acceptance Criteria
1. Job X 500 post + sentimen berjalan end-to-end di MCP dengan event berurutan diterima Dashboard (atau mock penerima).
2. Agent yang tidak mampu ditolak dengan kode yang benar; agent terpilih tercatat di `llm_calls`.
3. Data workspace lain tidak dapat dibaca melalui tool `intel_*`.
4. Toolset `pm` & test MCP yang ada tidak regresi; coverage modul `intel` ≥ 80%.
