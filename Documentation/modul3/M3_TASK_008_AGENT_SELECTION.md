# Task: Pemilihan Agent per Tahap
**ID:** M3_TASK_008
**Status:** To Do
**Repo:** `mcp` + `marketingdashboardjtp`
**Dependencies:** M3_TASK_007 (`intel_agents_list`), M3_TASK_001 (`intel_stage_defaults`)
**Estimasi:** 2 person-days
**Acuan:** README K3, [Kontrak §2.1 AgentInfo](M3_MCP_INTEGRATION.md#21-agentinfo)

## Objective
User memilih **agent mana** yang mengerjakan tiap tahap job, hanya dari agent yang benar-benar mampu, dengan validasi berlapis (Dashboard + MCP) dan default per workspace.

## A. Aturan kapabilitas (satu sumber: MCP `services/intel/capabilities.py`)

| Tahap | Kapabilitas | Toolset profil yang dibutuhkan | Default |
|---|---|---|---|
| `collect` | `collect` | minimal satu dari `social`, `web`, `trends` **dan** mencakup semua tipe sumber di spec (`x`/`threads` → `social`, `web` → `web`, `trends` → `trends`) | `researcher` |
| `analyze` | `analyze` | `analysis` (dan `sentiment_analyze` tidak di `tool_denylist`) | `analyst` |
| `index` (P1) | `index` | `kb` | `researcher` |

Profil bawaan MCP saat ini: `researcher` → collect, analyze, index · `analyst` → analyze, index · `strategist` → index saja (`sentiment_analyze` & `market_analyze` ada di denylist).

## B. MCP
- [ ] `capabilities.py` + `intel_agents_list` mengembalikan `capabilities`, `route`, `run_token_budget`, `is_active`, `gateway_key.source`.
- [ ] Validasi ulang saat `intel_job_create` (termasuk kecocokan tipe sumber vs toolset).
- [ ] Unit test untuk ketiga profil bawaan + profil kustom.

## C. Dashboard
- [ ] Seed: agent **`Agent_Analyst`** (`handle Agent_Analyst`, `mcp_agent_key analyst`, deskripsi "Analisis data & laporan") di workspace demo.
- [ ] `GET /workspaces/:ws/intel/agents`: gabungkan agent workspace (aktif, tidak terhapus) dengan `intel_agents_list` via `mcp_agent_key`; agent tanpa profil MCP → `capabilities: []`, `reason: "UNKNOWN_AGENT"`; profil nonaktif → `reason: "AGENT_INACTIVE"`.
- [ ] `GET/PUT /workspaces/:ws/intel/stage-defaults` (PUT admin): agent harus mampu untuk tahap tsb.
- [ ] Settings → Agents (Modul 1): kolom/badge **Kapabilitas** (Kumpulkan/Analisis/Indeks) dan **Route LLM** per agent; peringatan bila `mcp_agent_key` tidak dikenal MCP.
- [ ] Wizard langkah 3 (TASK_004) memakai endpoint di atas; default dari stage-defaults, bila tidak ada → agent mampu pertama (urut nama).
- [ ] `intel_job_stages.agent_id` + snapshot `agent_key` disimpan; agent yang kemudian dinonaktifkan tidak memengaruhi job yang sudah berjalan.

## Acceptance Criteria
1. `Agent_Strategist` tidak bisa dipilih untuk *Kumpulkan* maupun *Analisis* (UI nonaktif + API 422 `AGENT_NOT_CAPABLE` + MCP menolak bila dipaksa).
2. Job dengan sumber `web` ditolak bila agent collect tidak punya toolset `web`.
3. Laporan & daftar job menampilkan agent per tahap sesuai pilihan.
