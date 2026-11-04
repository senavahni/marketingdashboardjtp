# Task: Key LLM Gateway per Agent, Atribusi Biaya & Halaman AI & Gateway
**ID:** M3_TASK_009
**Status:** To Do
**Repo:** `llm-genai` (provisioning) + `mcp` + `marketingdashboardjtp`
**Dependencies:** M3_TASK_007 (kolom `llm_calls`, konteks agent tahap)
**Estimasi:** 3 person-days (+1 pd rotasi dari UI, P1)
**Acuan:** README K5–K6, [Kontrak §4](M3_MCP_INTEGRATION.md#4-llm-gateway--key-per-agent--atribusi), Gateway `docs/client-integration.md`, `docs/admin-api.http`

## Objective
Setiap agent memanggil LLM Gateway dengan **key `lgw_...` miliknya sendiri** sehingga pemakaian, biaya, rate limit, dan pencabutan bisa dikelola per agent — tanpa satu pun secret provider atau key Gateway berada di Dashboard.

## A. Lapisan secret (ringkas)
```
llm-genai/.env      OPENAI_API_KEY                 (provider, sudah ada)
LLM Gateway DB      project marketing-mcp → key lgw_ per agent (hash)
mcp DB              mcp.llm_credentials → key lgw_ terenkripsi AES-256-GCM (MCP_SECRET_KEY)
mcp/.env            LLM_GATEWAY_API_KEY (fallback), MCP_SECRET_KEY
dashboard .env      MCP_INTEL_API_KEY (bukan key Gateway)
```

## B. LLM Gateway (provisioning, tanpa perubahan kode)
- [ ] Project `marketing-mcp` (owner: tim marketing), allowed models: `fast`, `smart`, `embed-default`.
- [ ] Quota: harian & bulanan (`max_tokens`, `max_cost_usd`) — angka awal ditentukan PO (mis. USD 5/hari, USD 50/bulan).
- [ ] Key: `mcp-researcher`, `mcp-analyst`, `mcp-strategist`, `mcp-system`; scope `chat`, `embeddings`, `models:read`, `usage:read`; rpm/tpm per key (mis. 60 rpm / 200k tpm).
- [ ] Verifikasi dengan profil `remote-only` (`--no-runtime`): `GET /v1/models` per key menampilkan `fast`, `smart`, `embed-default`; satu chat `fast` & `smart` sukses memakai OpenAI.

## C. MCP
- [ ] Util `utils/secretbox.py`: AES-256-GCM (`cryptography`), key dari `MCP_SECRET_KEY` (32 byte base64; validasi start: wajib berbeda dari `MCP_KEY_PEPPER` & tiga secret Dashboard).
- [ ] Tabel `mcp.llm_credentials`: `id`, `name`, `agent_key` (NULL = system, UNIQUE), `gateway_key_id` (UUID key di Gateway), `key_prefix`, `key_enc`, `status` (`active|revoked|invalid`), `last_error`, `last_checked_at`, `created_at`, `rotated_at`.
- [ ] `manage.py gateway-keys provision --gateway-admin-url ... ` — membaca admin key Gateway dari prompt tersembunyi / env sementara (**tidak disimpan**), membuat/menemukan project & key via Admin API, menyimpan terenkripsi. Subperintah `list` (prefix & status), `import --agent <key>` (menempelkan key yang dibuat manual), `revoke-local`.
- [ ] `gateway_client.py`: pemilihan key per panggilan dari konteks (`agent_key` tahap/run) → `system` → `LLM_GATEWAY_API_KEY`; cache klien per key; header `X-Caller-Agent`, `X-Caller-Task`; 401/403 → tandai credential `invalid` + `last_error`.
- [ ] Berlaku juga untuk run agent Modul 1 (`pm_dispatch_task_to_agent` → key agent run) — perilaku sama, hanya sumber key yang berubah.
- [ ] `mcp.llm_calls`: isi `agent_key`, `job_id`, `stage`, `cost_usd` (dari `usage.cost` respons Gateway bila ada, selain itu harga route dari konfigurasi).
- [ ] Tool `intel_llm_status(range_days)`: agregat `llm_calls` per agent + status credential + `GET /v1/usage` project (key `system`); Gateway tak terjangkau → `project: null`, status `unknown`.
- [ ] (P1) Tool admin `intel_gateway_key_rotate(agent_key)` → Gateway `POST /admin/keys/{id}/rotate` memakai admin key yang disimpan terenkripsi **hanya bila** fitur rotasi diaktifkan (`GATEWAY_ROTATION_ENABLED=true`).

## D. Dashboard
- [ ] Settings → **AI & Gateway** (admin, TASK_003 §B.7): tabel agent (route, sumber key, prefix, status, pemakaian 7/30 hari, error terakhir), kartu pemakaian project per model, bagian default agent per tahap (TASK_008).
- [ ] Peringatan bila agent memakai key `system`/`env` (belum punya key sendiri).
- [ ] Detail job: biaya per tahap & per agent (dari `cost.by_stage`).
- [ ] (P1) Tombol **Rotasi key** per agent → endpoint admin → MCP tool rotasi; konfirmasi dialog; hasil hanya prefix baru.

## E. Test
- [ ] MCP: secretbox (round-trip, tamper → gagal), pemilihan key (agent → system → env), penandaan `invalid` pada 401, agregasi biaya.
- [ ] Integration MCP ↔ Gateway nyata (manual, `--no-runtime`): panggilan tahap analyze tercatat di Gateway `/admin/requests` dengan key prefix `analyst` & header `X-Caller-Agent: analyst`.
- [ ] Dashboard: halaman AI & Gateway hanya admin; respons tidak pernah memuat key lengkap.

## Acceptance Criteria
1. Mencabut key `mcp-analyst` di Gateway membuat tahap analisis gagal `LLM_KEY_INVALID` sementara agent lain tetap jalan.
2. Biaya per agent di Dashboard = agregat `mcp.llm_calls` (selisih ≤ 1% dengan Gateway `/v1/usage` untuk periode yang sama, di luar panggilan non-MCP).
3. `grep` di repo & DB Dashboard tidak menemukan `lgw_` lengkap; key di DB MCP hanya dalam bentuk terenkripsi.
