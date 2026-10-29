# Task: Backend API for Block Editor, Timeline, MCP Webhook & Real-time
**ID:** M1_TASK_003
**Status:** To Do
**Dependencies:** M1_TASK_001 (dan M1_TASK_002 untuk model task & agent run; M1_TASK_009 untuk test webhook)
**Estimasi:** 8 person-days (Backend)
**Acuan:** [ARCHITECTURE](M1_ARCHITECTURE.md), [M1_MCP_INTEGRATION](M1_MCP_INTEGRATION.md)

## Objective
Membangun API khusus untuk operasi Block Editor (Notion-like), kalkulasi Timeline & reschedule, penerima webhook MCP, Agent API, dan Real-time Gateway.

## Block Format
Format blok mengikuti struktur **BlockNote** (TASK_005) agar tidak perlu konversi rumit: satu blok BlockNote `{ id, type, props, content, children }` disimpan sebagai satu baris `document_blocks`:
- `id` → `id`, `type` → `block_type`, `{ props, content }` → `content_json`, `children` → baris lain dengan `parent_block_id` = id ini, urutan → `order_index`.

**Block type yang diizinkan & props-nya** (schema Zod di `packages/shared/src/blocks/`; sesuaikan detail dengan versi BlockNote yang di-pin saat spike):

| block_type | props | content |
|---|---|---|
| `paragraph` | `textColor`, `backgroundColor`, `textAlignment` | inline[] |
| `heading` | + `level` (1–3) | inline[] |
| `bulletListItem`, `numberedListItem` | warna & alignment | inline[] |
| `checkListItem` | + `checked: boolean` | inline[] |
| `quote` | warna | inline[] |
| `codeBlock` | `language` (whitelist) | inline[] (teks saja) |
| `table` | — | `tableContent` (rows → cells → inline[]), maks 50×20 |
| `image` | `url` (http/https), `caption`, `previewWidth`, `name` | — |
| `divider` *(custom)* | — | — |
| `bookmark` *(custom, embed link)* | `url` (http/https), `title?`, `description?` | — |
| `aiPrompt` *(custom, P1)* | `prompt` (≤ 4.000), `agent_id`, `status` (`idle|running|completed|failed`), `last_run_id` | — |

**Inline content** (rekursif):
- `{ "type": "text", "text": "...", "styles": { "bold"?, "italic"?, "underline"?, "strike"?, "code"?, "textColor"?, "backgroundColor"? } }`
- `{ "type": "link", "href": "https://...", "content": [ text... ] }`
- `{ "type": "mention", "props": { "mention_type": "user|agent", "id": "uuid", "label": "Agent_Strategist" } }`

Server: validasi schema → buang properti tidak dikenal → hitung `plain_text` → validasi mention (id harus member/agent workspace; jika tidak, ubah menjadi teks biasa `@label`).

**Block object (respons API):**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "task_id": "uuid|null",
  "parent_block_id": null,
  "block_type": "paragraph",
  "content_json": { "props": {}, "content": [ { "type": "text", "text": "Brief kampanye", "styles": {} } ] },
  "order_index": 0,
  "version": 3,
  "last_edited_by": { "type": "agent", "id": "uuid", "name": "Agent_Strategist" },
  "children": [],
  "created_at": "...",
  "updated_at": "..."
}
```

## Block Editor API
Semua endpoint menulis butuh role ≥ Member; membaca ≥ Viewer.

- [ ] `GET /api/v1/tasks/:id/blocks` — seluruh blok task sebagai **tree** (`children`), urut `order_index`.
- [ ] `GET /api/v1/projects/:id/brief/blocks` — blok Project Brief (`task_id IS NULL`).
- [ ] `POST /api/v1/blocks` — Create new block: `{ id?, project_id, task_id?, parent_block_id?, block_type, content_json, after_block_id? }`. Tanpa `after_block_id` → di akhir sibling. Server menggeser `order_index` sibling setelahnya.
- [ ] `PATCH /api/v1/blocks/:id` — Update block content: `{ block_type?, content_json, expected_version }` → 409 `VERSION_CONFLICT` (body berisi blok versi server) bila versi tidak cocok.
- [ ] `DELETE /api/v1/blocks/:id` — soft delete blok beserta seluruh `children`.
- [ ] `PATCH /api/v1/blocks/reorder` — Update `order_index` untuk drag-and-drop block: `{ task_id | project_id, parent_block_id, ordered_ids: [] }` (bisa sekaligus memindah blok ke parent ini).
- [ ] `POST /api/v1/blocks/batch` — **endpoint utama auto-save** (lihat di bawah).
- [ ] `POST /api/v1/blocks/:id/run` *(P1, feature flag)* — jalankan AI Prompt Block: validasi `block_type = aiPrompt` & agent aktif → buat run trigger `prompt_block` → job `agent.prompt_block` → set `props.status = running`.

**`POST /api/v1/blocks/batch`**
```json
// request
{
  "project_id": "uuid",
  "task_id": "uuid|null",
  "operations": [
    { "op": "upsert", "block": { "id": "uuid", "parent_block_id": null, "block_type": "paragraph", "content_json": { }, "order_index": 2 }, "expected_version": 3 },
    { "op": "upsert", "block": { "id": "uuid-baru", "parent_block_id": null, "block_type": "heading", "content_json": { }, "order_index": 3 } },
    { "op": "delete", "id": "uuid", "expected_version": 1 }
  ]
}
// response 200
{
  "applied": [ { "id": "uuid", "version": 4 }, { "id": "uuid-baru", "version": 1 } ],
  "conflicts": [ { "id": "uuid", "server_block": { "...": "Block object" } } ]
}
```
- Maks 200 operasi & 512 KB per request.
- `upsert` id baru → insert (`version = 1`); id lama → wajib `expected_version`, cocok → update & `version + 1`; tidak cocok → masuk `conflicts`, tidak diterapkan.
- Operasi tanpa konflik diterapkan dalam **satu transaksi**; konflik tidak membatalkan operasi lain.
- `order_index` dari klien dipakai apa adanya; server menormalisasi ulang (0..n per parent) di akhir transaksi bila ada duplikat.
- Validasi gagal di salah satu operasi → seluruh request 400 `VALIDATION_ERROR` dengan `details.operation_index`.
- Setelah commit: event real-time `block.upserted` / `block.deleted`, dan penanda activity `task.content_edited` (maks 1x/10 menit per user per task).
- Mention user **baru** di blok (belum ada di versi sebelumnya) → notifikasi `comment_mention` (judul "menyebut Anda di dokumen …"). Mention agent di blok tidak memicu agent.

## Timeline & Scheduling Logic
- [ ] `GET /api/v1/projects/:id/timeline?from=YYYY-MM-DD&to=YYYY-MM-DD` — Mengembalikan data task dalam format siap pakai library Gantt (menghitung durasi, offset hari). Tanpa `from/to` → seluruh task. Dengan `from/to` → task yang beririsan dengan rentang + seluruh ancestor-nya (agar tree tetap utuh).

```json
{
  "project_id": "uuid",
  "range": { "start": "2026-11-01", "end": "2026-11-05" },
  "today": "2026-10-29",
  "items": [
    {
      "id": "uuid", "parent_task_id": null, "depth": 1, "has_children": true,
      "title": "Market Research", "status": "in_progress", "priority": "medium",
      "assignee": { "type": "user", "id": "uuid", "name": "Owner Demo", "avatar_url": null },
      "agent_status": "idle",
      "start_date": "2026-11-01", "end_date": "2026-11-05",
      "duration_days": 5, "offset_days": 0,
      "is_milestone": false,
      "outside_parent_range": false
    }
  ],
  "unscheduled": [ { "id": "uuid", "parent_task_id": "uuid", "depth": 2, "title": "Scrape Meta", "status": "todo" } ]
}
```
  - `range.start/end` = tanggal paling awal/akhir semua item terjadwal (`null` jika tidak ada).
  - `duration_days = end_date - start_date + 1` (inklusif); milestone = `0`.
  - `offset_days = start_date - range.start`.
  - Urutan `items`: **DFS tree order** — sibling diurutkan `start_date asc` (null terakhir), lalu `order_index`. Task tanpa tanggal lengkap masuk `unscheduled`, tetapi jika ia punya anak terjadwal, ia tetap ada di `items` sebagai baris grup (dengan `start_date/end_date = null`).
  - `outside_parent_range = true` bila rentang task keluar dari rentang parent yang terjadwal.
  - Satu query (`WITH RECURSIVE` atau ambil semua task project lalu susun di memori — project ≤ 2000 task).
- [ ] `PATCH /api/v1/tasks/:id/reschedule` — Logic untuk update tanggal.
```json
// request
{ "start_date": "2026-11-03", "end_date": "2026-11-07", "cascade": "shift" }
// response 200
{ "updated": [ { "...": "Task" } ], "shifted_count": 2 }
```
  - `cascade`: `"shift"` = semua turunan yang bertanggal digeser sebesar `delta = new_start - old_start` hari (kedua tanggal); `"none"` = hanya task ini.
  - Jika task punya turunan bertanggal, `delta ≠ 0`, dan `cascade` tidak dikirim → **409 `CASCADE_DECISION_REQUIRED`** dengan `details: { descendant_count }` sehingga frontend menanyakan user. Jika `delta = 0` (hanya ubah durasi/end date) → tidak perlu `cascade`.
  - Validasi rentang & milestone seperti TASK_002; seluruh perubahan dalam satu transaksi; activity `task.rescheduled`; event real-time `tasks.rescheduled` berisi semua task yang berubah.

## MCP Webhook Receiver
- [ ] **Webhook Listener:** `POST /api/v1/webhooks/mcp/events` — satu endpoint untuk semua event agent (menggantikan `/webhooks/mcp-agent-block-update` di versi awal). Kontrak payload & respons: [MCP_INTEGRATION §5](M1_MCP_INTEGRATION.md#5-mcp-events--webhooks-mcp-server--dashboard).
- [ ] Aktifkan `rawBody: true` di NestJS; endpoint `@Public()` tetapi dilindungi `McpSignatureGuard`.
- [ ] Pipeline pemrosesan:
  1. Verifikasi `X-MCP-Timestamp` (±300 s) & `X-MCP-Signature` (HMAC-SHA256, `crypto.timingSafeEqual`; dukung `MCP_WEBHOOK_SECRET_PREVIOUS`) → 401.
  2. Validasi envelope + `data` per `event_type` dengan schema `packages/shared` → 400.
  3. Idempotency: `INSERT INTO mcp_webhook_events ... ON CONFLICT DO NOTHING`; sudah ada & `processed` → 200 `duplicate`.
  4. Muat run: ada, `agent_id` cocok, status aktif (`queued|dispatched|running`) → selain itu 404/409 `RUN_NOT_ACTIVE`.
  5. Validasi `task_id` = task run atau turunannya (cek ancestor).
  6. Jalankan handler per event dalam **satu transaksi** (efek per event lihat tabel MCP_INTEGRATION §5), update `agent_runs.last_event_at`, status run, `tasks.agent_status`.
  7. Catat activity dengan `actor_type = agent` (mis. `block.agent_updated` = "Agent updated this block").
  8. Setelah commit: event real-time + notifikasi; tandai event `processed`.
  9. Error tak terduga → event `rejected` + 500 (MCP akan retry dengan `event_id` sama; status `rejected` boleh diproses ulang).
- [ ] Handler `agent.block.appended` memakai service yang sama dengan `/blocks/batch` (validasi & versi identik), dengan `after_block_id` diterjemahkan menjadi posisi.
- [ ] Handler `agent.subtask.created` memakai service create task TASK_002 (validasi depth), `created_by_type = agent`, tidak memicu dispatch untuk `assign_to_self`.
- [ ] Untuk run trigger `prompt_block`: saat `completed`/`failed`, update `props.status` & `last_run_id` pada blok `aiPrompt` terkait.

## Agent API (untuk MCP Server)
- [ ] Guard `McpServiceTokenGuard` (Bearer `MCP_SERVICE_TOKEN`) + resolusi run dari path; run tidak aktif → 409.
- [ ] `GET /api/v1/agent-api/runs/:runId`
- [ ] `GET /api/v1/agent-api/runs/:runId/tasks/:taskId` — task harus berada di project run.
- [ ] `GET /api/v1/agent-api/runs/:runId/project-brief`
- [ ] `POST /api/v1/agent-api/runs/:runId/context/query` — FTS: `WHERE project_id = $1 AND deleted_at IS NULL AND search_vector @@ websearch_to_tsquery('simple', $q) ORDER BY ts_rank(...) DESC LIMIT $top_k`; `scope=task` membatasi ke task & turunannya. Query kosong → blok Project Brief urut dokumen.
- Detail payload: [MCP_INTEGRATION §6](M1_MCP_INTEGRATION.md#6-agent-api-mcp-server--dashboard).

## Real-time Gateway
- [ ] `RealtimeGateway` (Socket.IO, namespace `/realtime`) sesuai [ARCHITECTURE §6](M1_ARCHITECTURE.md#6-real-time-socketio): auth JWT di handshake, room `user:{id}` otomatis, `room.join`/`room.leave` dengan cek membership, Redis adapter.
- [ ] `RealtimeService.emitToProject/emitToTask/emitToUser` dipakai modul lain (TASK_002 & TASK_003), dipanggil **setelah commit**.
- [ ] Saat role user dicabut dari workspace → putuskan socket user tersebut dari room project workspace itu.

## Acceptance Criteria
- Block editor dapat menyimpan dan mengambil data JSON dengan cepat: `GET /tasks/:id/blocks` (1000 blok) dan `POST /blocks/batch` (50 operasi) p95 < 200 ms di staging.
- `content_json` berisi `javascript:` URL, properti asing, atau tipe blok tak dikenal ditolak/dibersihkan sesuai aturan.
- Dua klien mengubah blok yang sama dengan `expected_version` sama → klien kedua menerima blok tersebut di `conflicts`.
- Webhook dari MCP berhasil mengupdate blok dan mencatat `activity_log` bahwa "Agent updated this block"; event duplikat tidak memproses ulang; signature salah → 401; run dibatalkan → 409.
- `agent.subtask.created` membuat 3 subtask dan mengembalikan pemetaan `client_ref → id`.
- Endpoint timeline mengembalikan data yang valid untuk dirender di frontend Gantt chart (urutan DFS, durasi & offset benar, unscheduled terpisah); p95 < 500 ms untuk 1000 task.
- Reschedule parent tanpa `cascade` → 409; dengan `shift` semua subtask bergeser sesuai delta.
- Client yang membuka task menerima `block.upserted` < 2 detik setelah webhook diterima.
- `context/query` hanya mengembalikan blok dari project milik run.

## Testing
- Unit: schema blok (valid/invalid, URL berbahaya, mention invalid), ekstraksi `plain_text`, algoritma batch & konflik versi, kalkulasi timeline (durasi, offset, DFS, outside range), reschedule delta, verifikasi HMAC & window timestamp.
- Integration: alur webhook lengkap memakai Mock MCP (started → status → block → subtask → comment → completed), idempotency, run cancelled, Agent API scoping (run project A tidak bisa membaca project B), socket menerima event.
