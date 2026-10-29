# Task: Mock MCP Server & Developer Tools
**ID:** M1_TASK_009
**Status:** To Do
**Dependencies:** M1_TASK_001 (monorepo & `packages/shared`), kontrak [M1_MCP_INTEGRATION](M1_MCP_INTEGRATION.md)
**Estimasi:** 3 person-days (Backend)

## Objective
Menyediakan **Mock MCP Server** yang mengimplementasikan kontrak MCP Modul 1 secara penuh, agar Modul 1 bisa dikembangkan, didemokan, dan dites end-to-end (lokal & CI) **tanpa bergantung pada Custom MCP Server (Project 2)**. Mock ini juga menjadi implementasi referensi bagi tim Project 2.

## Lokasi & Stack
- `apps/mock-mcp` — Node.js + TypeScript, `@modelcontextprotocol/sdk` (`McpServer` + Streamable HTTP transport), Express/Fastify untuk HTTP, schema dari `packages/shared/src/mcp`.
- Port default `4100`, endpoint MCP `/mcp`.

<a id="konfigurasi"></a>
## Konfigurasi

| Variable | Contoh | Keterangan |
|---|---|---|
| `PORT` | `4100` | |
| `DASHBOARD_API_URL` | `http://localhost:3000/api/v1` | Fallback bila `callback` tidak dikirim |
| `MCP_SERVER_API_KEY` | sama dengan api | Validasi Bearer dari Dashboard |
| `MCP_WEBHOOK_SECRET` | sama dengan api | Menandatangani webhook |
| `MCP_SERVICE_TOKEN` | sama dengan api | Memanggil Agent API |
| `MOCK_STEP_DELAY_MS` | `1500` | Jeda antar event (CI: `200`) |
| `MOCK_LOG_LEVEL` | `info` | |

## Perilaku Tools
- [ ] Validasi `Authorization: Bearer`; tolak tanpa key yang benar.
- [ ] Validasi input setiap tool dengan schema shared; input invalid → `isError: true`, `code: VALIDATION_ERROR`, `retryable: false`.
- [ ] `pm_request_agent_estimation` → `start_date = earliest_start_date`, `end_date = +1 hari` (estimasi 2 hari), `message: "Saya akan mengerjakan ini. Estimasi selesai 2 hari."`.
- [ ] `pm_dispatch_task_to_agent` → balas `{ accepted: true, mcp_run_id: "mock-<uuid>" }` segera, lalu jalankan **skenario** di background.
- [ ] `pm_notify_agent_mention` → skenario "revisi": `started` → `status thinking` → baca task via Agent API → `block.appended` (`update` blok paragraf pertama yang ditulis agent dengan teks "[Direvisi: tone formal] …", memakai `expected_version`) → `comment.added` (balas di thread: "Sudah saya ubah sesuai permintaan.") → `completed`.
- [ ] `pm_execute_prompt_block` → `block.appended` 1 blok paragraf berisi "Hasil untuk prompt: <prompt>" setelah prompt block → `completed`.
- [ ] `pm_cancel_agent_run` → hentikan skenario yang sedang berjalan untuk `run_id` itu, `{ cancelled: true }`.

## Skenario (dipilih berdasarkan `agent_key`)

| `agent_key` | Skenario dispatch |
|---|---|
| `strategist` (default) | **UC3 penuh:** `agent.task.started` → `agent.status.changed (thinking)` → panggil `context/query` ("brief") → `agent.status.changed (working)` → `agent.block.appended` (heading "Content Calendar" + 3 paragraf, salah satunya merangkum hasil context query) → `agent.subtask.created` ("Draft Week 1/2/3", `assign_to_self: true`) → `agent.comment.added` ("Kalender konten selesai, mohon direview.") → `agent.task.completed` |
| `researcher` | Sama seperti `strategist` tanpa subtask |
| `failing` | `started` → `status working` → `agent.task.failed` (`error_code: MOCK_FAILURE`, `retryable: true`) |
| `slow` | Seperti `strategist` dengan jeda 10× (untuk tes indikator & cancel) |
| `unavailable` | Tool call langsung mengembalikan error `retryable: true` (tes retry Dashboard) |
| `silent` | Accept lalu tidak mengirim event apa pun (tes sweeper timeout) |

- [ ] Webhook dikirim **berurutan**, ditandatangani HMAC sesuai kontrak, `event_id` unik, retry pada 429/5xx (1s, 2s, 4s; maks 5x), berhenti total jika menerima `409 RUN_NOT_ACTIVE`.
- [ ] Log setiap tool call & webhook (ringkas) ke stdout.

## Developer Tools
- [ ] **CLI pengirim event manual** — `pnpm --filter mock-mcp send-event <event_type> --run <run_id> --agent <agent_id> --task <task_id> [--data '<json>' | --file payload.json] [--event-id <uuid>] [--bad-signature] [--old-timestamp]` untuk menguji webhook secara manual, termasuk kasus negatif (signature salah, replay, duplikat).
- [ ] **Endpoint inspeksi** (hanya mock): `GET /_mock/runs` — daftar run & event yang sudah dikirim; `POST /_mock/reset` — bersihkan state (dipakai E2E).
- [ ] **Seed besar** untuk performa: script `db:seed:large` di `apps/api` (1000 task 3 level + 1 task dengan 1000 blok).
- [ ] Dockerfile `docker/mock-mcp.Dockerfile` + service di `docker-compose.yml` (profile `full`).
- [ ] README singkat di `apps/mock-mcp/README.md`: cara menjalankan, daftar skenario, contoh CLI.

## Acceptance Criteria
- Dengan `pnpm dev`, assign task ke `@Agent_Strategist` di UI menjalankan UC2 + UC3 penuh hingga task `done` tanpa intervensi manual.
- Mention agent di komentar menjalankan UC4 (blok terupdate + balasan).
- Skenario `failing`, `unavailable`, `silent`, `slow` + cancel menghasilkan perilaku Dashboard sesuai MCP_INTEGRATION §4 & §7.
- Semua payload yang dikirim mock lolos schema `packages/shared` (dites di contract test).
- CLI `send-event --bad-signature` menghasilkan 401 dari Dashboard.
