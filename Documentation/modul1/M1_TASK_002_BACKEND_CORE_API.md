# Task: Backend Core API (Workspace, Projects, Tasks, Hierarchy, Collaboration)
**ID:** M1_TASK_002
**Status:** To Do
**Dependencies:** M1_TASK_001 (dan M1_TASK_009 untuk integration test dispatch agent)
**Estimasi:** 8 person-days (Backend)
**Acuan:** konvensi API & format error di [ARCHITECTURE §4](M1_ARCHITECTURE.md#4-konvensi-api), RBAC di [TASK_001 §C.2](M1_TASK_001_INFRA_SECURITY_DB.md#rbac), kontrak agent di [M1_MCP_INTEGRATION](M1_MCP_INTEGRATION.md)

## Objective
Membangun RESTful API untuk manajemen workspace, member, agent, hierarki Project → Task → Subtask, komentar, activity log, notifikasi, serta pengiriman task ke Agent (MCP).

## Objek Respons Standar

**Task**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "parent_task_id": null,
  "depth": 1,
  "title": "Market Research",
  "status": "todo",
  "priority": "medium",
  "assignee": { "type": "agent", "id": "uuid", "name": "Agent_Strategist", "avatar_url": null },
  "start_date": "2026-11-01",
  "end_date": "2026-11-05",
  "is_milestone": false,
  "tags": ["research"],
  "order_index": 0,
  "agent_status": "idle",
  "active_run": { "id": "uuid", "status": "running", "trigger": "assignment" },
  "subtask_count": 2,
  "created_by": { "type": "user", "id": "uuid", "name": "Owner Demo" },
  "completed_at": null,
  "created_at": "2026-10-29T03:00:00Z",
  "updated_at": "2026-10-29T03:00:00Z"
}
```
`assignee` untuk user: `{ "type": "user", "id", "name": display_name, "avatar_url" }`. `active_run` = `null` bila tidak ada run aktif.

**Project**: `{ id, workspace_id, title, description, icon, created_by, task_count, created_at, updated_at }`
**Comment**: `{ id, project_id, entity_type, entity_id, parent_comment_id, author: { type, id, name, avatar_url }, content, mentions: [{ type, id, name }], edited_at, created_at, reply_count }`
**Activity**: `{ id, project_id, entity_type, entity_id, action, actor: { type, id, name }, metadata, created_at }`
**Notification**: `{ id, type, title, body, project_id, entity_type, entity_id, actor, read_at, created_at, url }`

## API Endpoints

### Workspace & Member
- [ ] `GET /api/v1/workspaces` — workspace milik user + role.
- [ ] `POST /api/v1/workspaces` — `{ name, timezone? }`; pembuat menjadi Owner.
- [ ] `GET /api/v1/workspaces/:workspaceId`
- [ ] `PATCH /api/v1/workspaces/:workspaceId` — `{ name?, timezone? }` (Admin+).
- [ ] `GET /api/v1/workspaces/:workspaceId/members` — `[{ user: { id, display_name, username, email, avatar_url }, role, created_at }]`.
- [ ] `POST /api/v1/workspaces/:workspaceId/members` — `{ email, role }` (Admin+). User harus sudah terdaftar, jika tidak → 404 `USER_NOT_FOUND`; sudah anggota → 409 `ALREADY_EXISTS`. Role `owner` tidak boleh di sini.
- [ ] `PATCH /api/v1/workspaces/:workspaceId/members/:userId` — `{ role }`.
- [ ] `DELETE /api/v1/workspaces/:workspaceId/members/:userId` — task yang di-assign ke user tersebut di workspace ini di-unassign.
- [ ] `POST /api/v1/workspaces/:workspaceId/transfer-ownership` — `{ user_id }` (Owner).
- [ ] `GET /api/v1/workspaces/:workspaceId/assignees?q=` — untuk assignee picker & mention: `{ "humans": [{ id, name, username, avatar_url }], "agents": [{ id, name, handle, description, avatar_url, is_active }] }`. Viewer tidak termasuk di `humans` (tidak bisa jadi assignee). Pencarian prefix, case-insensitive, maks 20 per grup.

### Agent Registry
- [ ] `GET /api/v1/workspaces/:workspaceId/agents?include_inactive=false`
- [ ] `POST /api/v1/workspaces/:workspaceId/agents` — `{ name, handle, mcp_agent_key, description?, avatar_url? }` (Admin+).
- [ ] `PATCH /api/v1/agents/:agentId` — termasuk `is_active`. Menonaktifkan agent membatalkan semua run aktif agent tersebut.
- [ ] `DELETE /api/v1/agents/:agentId` — soft delete; task yang di-assign ke agent ini di-unassign + run dibatalkan.

### Project
- [ ] `GET /api/v1/workspaces/:workspaceId/projects` — urut `updated_at desc`.
- [ ] `POST /api/v1/projects` — Create project: `{ workspace_id, title (1–200), description?, icon? }`.
- [ ] `GET /api/v1/projects/:id` — Get project detail.
- [ ] `PATCH /api/v1/projects/:id`
- [ ] `DELETE /api/v1/projects/:id` — soft delete cascade (lihat Business Logic).

### Task
- [ ] `POST /api/v1/projects/:id/tasks` — Create task (root): `{ title, status?, priority?, assignee?: { type, id } | null, start_date?, end_date?, is_milestone?, tags?, after_task_id? }`.
- [ ] `GET /api/v1/projects/:id/tasks?view=list|board` — Get tasks dengan filter (lihat di bawah).
- [ ] `GET /api/v1/tasks/:id` — Task + `breadcrumbs` (`[{ id, title }]` dari root) + `subtasks` (anak langsung).
- [ ] `PATCH /api/v1/tasks/:id` — Update task (title, status, priority, assignee, dates, is_milestone, tags). Perubahan tanggal lewat endpoint ini **tidak** menggeser subtask (gunakan `/reschedule` di TASK_003 untuk cascade).
- [ ] `DELETE /api/v1/tasks/:id` — soft delete task + seluruh turunan + blok + komentar.
- [ ] `POST /api/v1/tasks/:id/subtasks` — Create subtask (body sama dengan create task).
- [ ] `PATCH /api/v1/tasks/:id/move` — `{ parent_task_id: uuid | null }` pindah parent / jadikan root.
- [ ] `PATCH /api/v1/tasks/reorder` — `{ project_id, status, ordered_task_ids: [] }` urutan card di kolom Board/list (maks 500 id).
- [ ] `POST /api/v1/tasks/:id/agent-run/retry` — buat run baru untuk agent assignee bila run terakhir `failed`.
- [ ] `POST /api/v1/tasks/:id/agent-run/cancel` — batalkan run aktif (reason `user_cancelled`).

**Query `GET /projects/:id/tasks`:**

| Param | Keterangan |
|---|---|
| `view` | `list` (default): array datar semua task (termasuk subtask) diurutkan sesuai `sort`, frontend menyusun tree via `parent_task_id`. `board`: `{ "columns": [{ "status": "todo", "tasks": [] }, ...] }` berisi 4 status, urut `order_index`, default hanya root task |
| `include_subtasks` | `true/false` — untuk board (default `false`) |
| `status`, `priority` | multi-value: `status=todo&status=in_progress` |
| `assignee_type`, `assignee_id` | filter assignee; `assignee_id=me` untuk diri sendiri; `assignee_type=none` untuk belum di-assign |
| `tag` | multi-value, cocok bila task punya salah satu tag |
| `q` | pencarian judul (ILIKE, min 2 karakter) |
| `sort` | `order_index` (default) \| `start_date` \| `end_date` \| `priority` \| `created_at`; prefix `-` untuk desc |
| `limit`, `cursor` | `list`: default 500, maks 2000 (project M1 diasumsikan ≤ 2000 task) |

> Data Timeline **tidak** lewat endpoint ini; gunakan `GET /projects/:id/timeline` (TASK_003).

### Comment
- [ ] `GET /api/v1/comments?entity_type=task&entity_id=:id&cursor=` — komentar root urut `created_at asc` + `replies` (maks 50 per root).
- [ ] `POST /api/v1/comments` — `{ entity_type: project|task|block, entity_id, parent_comment_id?, content, mentions: [{ type, id }] }`. Server memvalidasi bahwa setiap mention adalah anggota/agent workspace yang sama; mention yang tidak valid dibuang.
- [ ] `PATCH /api/v1/comments/:id` — `{ content, mentions }` (hanya author), set `edited_at`.
- [ ] `DELETE /api/v1/comments/:id` — soft delete (author, atau Admin/Owner).

### Activity
- [ ] `GET /api/v1/projects/:id/activity?cursor=&limit=50`
- [ ] `GET /api/v1/tasks/:id/activity?cursor=&limit=50` — termasuk aktivitas blok & komentar di task tsb.

### Notification
- [ ] `GET /api/v1/notifications?unread_only=false&cursor=&limit=30`
- [ ] `GET /api/v1/notifications/unread-count` → `{ "count": 3 }`
- [ ] `PATCH /api/v1/notifications/:id/read`
- [ ] `POST /api/v1/notifications/read-all`

## Business Logic
- [ ] **Validasi hierarki:** Subtask tidak boleh menjadi parent dari task utama (mencegah circular reference). Pada `move`: parent baru harus di project yang sama (`CROSS_PROJECT_PARENT`), bukan diri sendiri/turunan sendiri (`CIRCULAR_HIERARCHY`, dicek dengan recursive CTE), dan `depth parent baru + tinggi subtree yang dipindah ≤ 3` (`HIERARCHY_DEPTH_EXCEEDED`). `depth` seluruh subtree dihitung ulang dalam satu transaksi.
- [ ] **Batas kedalaman:** create subtask di bawah task `depth = 3` → 422 `HIERARCHY_DEPTH_EXCEEDED`.
- [ ] **Validasi Timeline:** `end_date` tidak boleh lebih kecil dari `start_date` (422 `INVALID_DATE_RANGE`); saat PATCH hanya salah satu tanggal, validasi terhadap nilai yang tersimpan. Milestone: `start_date = end_date` wajib; jika user mengaktifkan milestone dan hanya ada salah satu tanggal, tanggal lain disamakan.
- [ ] **Status:** status menjadi `done` → set `completed_at`; keluar dari `done` → `completed_at = null`. Perubahan status via PATCH/Board menaruh task di akhir kolom tujuan (kecuali disertai reorder).
- [ ] **Logika Assignee:**
  - `assignee.type = user` → user harus anggota workspace dengan role ≠ viewer (`INVALID_ASSIGNEE`). Jika bukan diri sendiri → notifikasi `task_assigned`.
  - `assignee.type = agent` → agent harus milik workspace yang sama dan aktif (`AGENT_INACTIVE`). Dalam satu transaksi: buat `agent_runs` (trigger `assignment`, status `queued`, `dispatched_by` = user), set `tasks.agent_status = queued`; **setelah commit** enqueue job `agent.dispatch`. Respons dikembalikan tanpa menunggu MCP.
  - Assignee berubah **dari** agent (ke user lain / null / agent lain) saat ada run aktif → run `cancelled`, enqueue `agent.cancel`, `agent_status = idle` (lalu proses agent baru bila assignee baru juga agent).
  - Assign ulang ke agent yang sama saat run aktif → tidak membuat run baru (idempotent).
- [ ] **Worker `agent.dispatch`** (modul `agent-runs`):
  1. Muat task, blok (≤ 200 blok / 100 KB), subtask langsung.
  2. Jika `start_date` dan `end_date` keduanya kosong → panggil `pm_request_agent_estimation` (timeout 30 s). Sukses & valid → isi tanggal (jika masih kosong saat ditulis), komentar agent dari `message`, activity `agent.estimated`, event real-time `task.updated`. Gagal → activity `agent.estimation_failed`, lanjut.
  3. Panggil `pm_dispatch_task_to_agent`. `accepted` → run `dispatched`, simpan `mcp_run_id`, `attempts++`.
  4. Error retryable → lempar error agar BullMQ retry (5x). Setelah percobaan terakhir atau error non-retryable → run `failed` + `last_error`, `agent_status = failed`, notifikasi `agent_task_failed` ke `dispatched_by`, event `agent.status`.
  5. Sebelum memanggil MCP, cek ulang run masih `queued` (bisa sudah dibatalkan).
- [ ] **Mention di komentar:** untuk tiap mention:
  - user (bukan author) → notifikasi `comment_mention`.
  - agent aktif, author manusia → buat run trigger `mention` (`trigger_ref_id` = comment id, `task_id` dari entity bila task/blok) + job `agent.mention`. Batas 10 run mention/task/jam → selebihnya diabaikan dengan komentar sistem "Batas permintaan ke agent tercapai, coba lagi nanti".
  - agent nonaktif → tidak dipicu; respons komentar menyertakan `warnings: ["AGENT_INACTIVE:<handle>"]`.
- [ ] **Cascade Delete (soft delete):** hapus project → seluruh task, subtask, blok, komentar di-soft-delete dalam satu transaksi dengan `deleted_at` yang sama; semua run aktif di project dibatalkan (`reason: task_deleted`). Hapus task → sama untuk subtree-nya. Event real-time `task.deleted` membawa semua `deleted_ids`.
- [ ] **Order index:** task baru diletakkan di akhir (`max + 1`) atau setelah `after_task_id`. `reorder` menulis ulang `order_index` 0..n dalam satu transaksi untuk task di (project, status).
- [ ] **Activity log** (dicatat dalam transaksi yang sama dengan perubahan). Katalog `action`:

| action | metadata_json |
|---|---|
| `project.created` / `project.updated` / `project.deleted` | `{ changes }` |
| `task.created` | `{ title, parent_task_id }` |
| `task.updated` | `{ changes: { field: { from, to } } }` (title, priority, tags, is_milestone) |
| `task.status_changed` | `{ from, to }` |
| `task.assigned` | `{ from: {type,id,name}\|null, to: {type,id,name}\|null }` |
| `task.rescheduled` | `{ from: {start_date,end_date}, to: {...}, cascade, shifted_count }` |
| `task.moved` | `{ from_parent_id, to_parent_id }` |
| `task.deleted` | `{ deleted_count }` |
| `task.content_edited` | `{ block_count }` — edit blok oleh manusia, maks 1 entri per user per task per 10 menit (penanda di Redis) |
| `block.agent_updated` | `{ block_ids, appended, updated }` |
| `comment.created` | `{ comment_id, excerpt }` |
| `member.added` / `member.role_changed` / `member.removed` | `{ user_id, role }` |
| `agent.created` / `agent.updated` / `agent.deactivated` | `{ agent_id }` |
| `agent.estimated` / `agent.estimation_failed` | `{ start_date, end_date, estimated_days }` / `{ error }` |
| `agent.dispatched` / `agent.started` / `agent.completed` / `agent.failed` / `agent.cancelled` | `{ run_id, trigger, error? }` |

- [ ] **Notifikasi:** dibuat setelah commit, dikirim real-time `notification.created` ke room `user:{id}`. Tidak pernah mengirim notifikasi ke aktor dirinya sendiri. Tipe & penerima:

| type | Penerima | Judul contoh |
|---|---|---|
| `task_assigned` | assignee user baru | "Owner Demo menugaskan Anda: Market Research" |
| `comment_mention` | user yang di-mention | "Manager Demo menyebut Anda di Generate Content Calendar" |
| `agent_comment` | pembuat task + `dispatched_by` run | "Agent_Strategist berkomentar di Generate Content Calendar" |
| `agent_task_completed` | `dispatched_by` + pembuat task | "Agent_Strategist menyelesaikan Generate Content Calendar" |
| `agent_task_failed` | `dispatched_by` | "Agent_Strategist gagal mengerjakan Generate Content Calendar" |

- [ ] **Real-time:** setiap mutasi memancarkan event sesuai [ARCHITECTURE §6](M1_ARCHITECTURE.md#6-real-time-socketio) **setelah transaksi commit** (gunakan helper `afterCommit`), menyertakan `origin_client_id` dari header `X-Client-Id`.

## Implementation Steps
1. [ ] Modul `workspaces` (+ members, assignees) dan `agents`.
2. [ ] Modul `projects`.
3. [ ] Modul `tasks`: service hierarki (recursive CTE untuk descendant/ancestor), validasi tanggal, reorder, move, delete cascade.
4. [ ] Modul `activity` (service `log()` yang menerima transaksi Prisma) & `notifications`.
5. [ ] Modul `comments` + ekstraksi & validasi mention.
6. [ ] Modul `agent-runs`: `McpClientService` (SDK MCP, timeout, mapping error → retryable), queue `mcp-outbound` + worker (`agent.dispatch`, `agent.mention`, `agent.cancel`), sweeper timeout.
7. [ ] Swagger decorator untuk semua endpoint.
8. [ ] Test (§Testing).

## Acceptance Criteria
- API dapat membuat project dan task bersarang (subtask) hingga 3 level; level ke-4 ditolak 422.
- Memindahkan task ke turunannya sendiri ditolak 422 `CIRCULAR_HIERARCHY`.
- Mengassign task ke Agent berhasil memicu tool `pm_dispatch_task_to_agent` di Mock MCP (didahului `pm_request_agent_estimation` bila task belum bertanggal), dan respons PATCH < 300 ms walau MCP mati.
- Saat MCP mati, run menjadi `failed` setelah 5 percobaan dan user menerima notifikasi `agent_task_failed`; `retry` membuat run baru.
- Mengganti assignee dari agent ke user memanggil `pm_cancel_agent_run`.
- `view=board` mengembalikan 4 kolom status berurutan sesuai `order_index`.
- Hapus project membuat seluruh task/blok/komentar tidak muncul lagi di API manapun.
- Mention user di komentar membuat notifikasi; mention agent membuat run `mention`.
- Semua endpoint mengembalikan 404 untuk user non-anggota workspace (diuji di IDOR suite TASK_008).

## Testing
- Unit: validasi hierarki (depth, circular, cross project), validasi tanggal & milestone, mapping assignee → efek samping, ekstraksi mention, penerima notifikasi, mapping error MCP → retryable.
- Integration (Testcontainers + Mock MCP): alur assign agent → estimasi → dispatch; MCP down → retry → failed; cancel; delete cascade; board reorder; filter list.
