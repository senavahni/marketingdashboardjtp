# Task: Frontend Agent Collaboration & Real-time UI
**ID:** M1_TASK_007
**Status:** To Do
**Dependencies:** M1_TASK_005, M1_TASK_003, M1_TASK_002
**Estimasi:** 6 person-days (Frontend)
**Acuan:** event real-time [ARCHITECTURE §6](M1_ARCHITECTURE.md#6-real-time-socketio), status agent [MCP_INTEGRATION §4](M1_MCP_INTEGRATION.md#4-siklus-hidup-agent-run)

## Objective
Membangun UI yang menangani interaksi spesifik dengan Agentic AI dan notifikasi real-time.

## Implementation Steps
- [ ] **Realtime client** (`lib/realtime.ts` + `RealtimeProvider`):
  - `socket.io-client` ke `VITE_WS_URL` dengan `auth.token`; saat error `TOKEN_EXPIRED` → refresh token → reconnect.
  - Hook `useRealtimeRoom('project' | 'task', id)` untuk join/leave otomatis mengikuti halaman; rejoin semua room setelah reconnect.
  - Setelah reconnect: invalidate query project/task yang aktif (event selama terputus tidak di-replay).
  - Abaikan event dengan `origin_client_id` = `X-Client-Id` tab ini.
  - Indikator koneksi kecil ("Terputus — mencoba menyambung…") bila socket putus > 5 detik.
- [ ] **Pemetaan event → cache TanStack Query:**

| Event | Aksi di frontend |
|---|---|
| `task.created` / `task.updated` | `updateTaskInCaches(task)` (TASK_006) |
| `task.deleted` | hapus `deleted_ids` dari semua cache; jika Task Detail yang terbuka ikut terhapus → tutup panel + toast |
| `tasks.rescheduled` / `tasks.reordered` | update batch di cache list/board/timeline |
| `block.upserted` / `block.deleted` / `blocks.reordered` | teruskan ke `useRemoteBlocks` editor (TASK_005) |
| `comment.*` | update cache komentar entity terkait |
| `activity.created` | prepend ke cache activity |
| `agent.status` | update `agent_status` task di cache |
| `notification.created` | update cache notifikasi & unread count, tampilkan toast (lihat di bawah) |

- [ ] **Assignee Picker Custom:** Buat dropdown (combobox) khusus saat memilih assignee. Pisahkan section "Humans" dan "AI Agents" (data `GET /workspaces/:id/assignees?q=`). Tambahkan ikon robot/AI dan deskripsi singkat untuk agen; opsi "Tanpa assignee". Agent nonaktif tidak tampil. Saat memilih agent untuk task yang sedang dikerjakan agent lain → konfirmasi "Agent sebelumnya akan dihentikan".
- [ ] **Agent Status Indicator:** Tampilkan badge di samping nama Agent pada task card, baris list, bar timeline, dan Task Detail, berdasarkan `agent_status`:

| `agent_status` | Badge |
|---|---|
| `queued` | "Menunggu…" (abu-abu) |
| `thinking` | "Thinking…" (animasi titik) |
| `working` | "Working…" (animasi) |
| `completed` | "Done" (hijau, hilang dari card setelah 24 jam / dibuka) |
| `failed` | "Gagal" (merah) + tombol **Coba lagi** (`POST /tasks/:id/agent-run/retry`) + tooltip pesan error |
| `idle` | tidak ada badge |

  Di Task Detail juga tersedia tombol **Hentikan agent** (`POST /tasks/:id/agent-run/cancel`) saat run aktif.
- [ ] **Real-time Block Updates:** Gunakan WebSocket (Socket.IO). Jika Agent mengupdate blok, UI user langsung ter-update tanpa perlu refresh (via `useRemoteBlocks` TASK_005). Saat `agent_status` thinking/working pada task yang dibuka → banner di atas editor "Agent_Strategist sedang menulis…". Konflik dengan blok yang sedang diedit user → banner "Agent memperbarui blok ini — Muat versi terbaru".
- [ ] **Comment Section UI:** Buat UI thread komentar di panel task detail (tab Komentar) dan di Project Brief.
  - Tampilkan avatar berbeda untuk Human (lingkaran) dan Agent (kotak + robot + label "AI"); komentar sistem (mis. error agent) dengan gaya netral.
  - Thread 1 level (Balas), urut waktu, "(diedit)", edit/hapus milik sendiri (Admin/Owner boleh hapus semua).
  - Composer: textarea auto-grow dengan **mention `@`** (popover suggestion dari `/assignees`, sisipkan `@handle` dan simpan `mentions: [{type,id}]`), Ctrl/Cmd+Enter kirim, optimistic insert.
  - Jika respons berisi `warnings` `AGENT_INACTIVE` → info inline.
  - Indikator "Agent_Strategist sedang mengetik…" di bawah thread saat run mention aktif dan `agent_status = thinking|working`.
  - Viewer: composer disembunyikan (README D5).
- [ ] **Activity Log Feed:** Buat tab "Activity" di project dan task yang menampilkan riwayat perubahan (siapa melakukan apa, kapan) dengan infinite scroll (`cursor`).
  - Pemetaan `action` → kalimat (katalog di TASK_002), contoh: `task.status_changed` → "**Owner Demo** mengubah status dari To Do ke In Progress", `block.agent_updated` → "**Agent_Strategist** memperbarui konten (3 blok)".
  - Waktu relatif ("5 menit lalu") dengan tooltip waktu lengkap (Asia/Jakarta).
  - Kelompokkan aksi beruntun oleh aktor yang sama dalam 5 menit.
- [ ] **Notifications:**
  - Lonceng di sidebar dengan badge unread (`/notifications/unread-count`, update via `notification.created`).
  - Panel daftar notifikasi (infinite scroll), klik → navigasi ke `url` + `PATCH /notifications/:id/read`; "Tandai semua dibaca".
- [ ] **Toast Notifications:** Tampilkan notifikasi pop-up (sonner) di pojok kanan bawah untuk `notification.created` bertipe `agent_task_completed`, `agent_comment`, `agent_task_failed`, `comment_mention`, `task_assigned` — dengan tombol "Buka". Maks 3 toast tampil bersamaan; tidak tampil jika user sedang membuka task yang sama (cukup update in-place).

## Acceptance Criteria
- User bisa membedakan dengan jelas antara tugas yang di-handle manusia vs agen (avatar, ikon, label — bukan hanya warna).
- Update dari agen (status, blok, subtask, komentar) muncul secara real-time di UI < 2 detik tanpa refresh, di dua browser berbeda sekaligus.
- Setelah koneksi internet dimatikan 30 detik lalu dinyalakan, UI kembali sinkron tanpa reload.
- Badge status agent berubah Menunggu → Thinking/Working → Done saat menjalankan UC2–UC3 dengan Mock MCP; skenario gagal menampilkan "Gagal" + Coba lagi yang berfungsi.
- Mention `@Agent_Strategist` di komentar memicu agent (UC4) dan balasan agent muncul di thread.
- Sistem notifikasi berjalan tanpa error: unread count akurat, klik membuka task, toast muncul untuk event agent.

## Testing
- Unit: reducer pemetaan event → cache, kalimat activity per action, parser mention composer.
- Component: Assignee picker (section, pencarian), badge per status.
- E2E (TASK_008): E2E-02, E2E-03, E2E-04, E2E-08 (dua browser context untuk real-time).
