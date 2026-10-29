# Task: Frontend Views (List, Board, Timeline)
**ID:** M1_TASK_006
**Status:** To Do
**Dependencies:** M1_TASK_004, M1_TASK_002 (dan M1_TASK_003 untuk Timeline & reschedule)
**Estimasi:** 10 person-days (Frontend)

## Objective
Membangun 3 view utama untuk menampilkan data task, beserta kerangka aplikasi (routing, layout, header project, Task Detail panel) yang dipakai TASK_005 & TASK_007.

## Tech Stack
- Table/List: **TanStack Table** (React Table) + **TanStack Virtual** (virtualisasi baris).
- Board/Kanban: **dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`, mendukung keyboard sensor). *(HelloPangea dnd sebagai alternatif.)*
- Timeline/Gantt — **keputusan via spike 1 hari (README D2):**
  1. **SVAR React Gantt** (edisi open source) — cek lisensi, dukungan tree/hierarki, drag & resize, milestone, kustomisasi tampilan bar & virtualisasi 1000 baris.
  2. Jika tidak memenuhi → **custom Gantt**: React + CSS grid + TanStack Virtual (baris) + pointer events (drag/resize), skala hari/minggu.
  - Catatan koreksi: **DHTMLX Gantt** (Pro) dan **Bryntum Gantt** keduanya **berbayar**; **Frappe Gantt** gratis (MIT) tetapi tidak punya tree grid & virtualisasi sehingga tidak cocok untuk 1000 task berhierarki.
- Server state: **TanStack Query**; UI state: **Zustand**; tanggal: **date-fns**.

## Kerangka Aplikasi (bagian dari task ini)
- [ ] Routing (React Router):

| Route | Halaman |
|---|---|
| `/login`, `/register` | Auth |
| `/w/:workspaceId` | Redirect ke project terakhir dibuka / empty state |
| `/w/:workspaceId/p/:projectId?view=list\|board\|timeline` | Project view (default `list`) |
| `/w/:workspaceId/p/:projectId/brief` | Project Brief (editor TASK_005) |
| `/w/:workspaceId/p/:projectId/t/:taskId` | Task Detail sebagai side panel di atas view aktif (deep link) |
| `/w/:workspaceId/settings/members`, `/settings/agents` | Settings |

- [ ] **API client** (`lib/api.ts`): `fetch` wrapper, header `Authorization` & `X-Client-Id`, refresh token otomatis sekali saat 401 `TOKEN_EXPIRED` (single-flight: request paralel menunggu satu proses refresh), parsing format error standar.
- [ ] **Auth flow:** saat app load panggil `/auth/refresh` → `/auth/me`; route terproteksi redirect ke `/login`.
- [ ] **Layout:** Sidebar (workspace switcher, projects, agents, notifikasi, profil) + area konten.
- [ ] **Project header:** breadcrumb, judul editable, tombol Brief, avatar member, **View Switcher**, filter bar, "+ Task".
- [ ] **Task Detail panel** (Sheet kanan): judul, `TaskEditor` (TASK_005), properties (status, priority, assignee picker TASK_007, date range, milestone, tags), daftar subtask (+ tambah, maks level 3), tab Komentar/Activity (TASK_007), breadcrumb ke parent.
- [ ] **Hak akses UI:** Viewer → semua kontrol edit disembunyikan/disabled, drag dimatikan.

## Data & State
- [ ] Satu sumber data per project: query key `['project', projectId, 'tasks', filters]` (list/board) dan `['project', projectId, 'timeline']`. Mutasi task memakai **optimistic update** dengan helper `updateTaskInCaches(task)` yang memperbarui semua cache terkait sekaligus (list, board, timeline, task detail) agar data **konsisten di ketiga view**; rollback + toast jika gagal.
- [ ] Filter & `view` disimpan di URL query string (bisa dibagikan/di-bookmark).
- [ ] Preferensi tampilan (lebar kolom, baris collapsed, zoom timeline, show subtasks) di Zustand + `localStorage` per project.
- [ ] **Utilitas tanggal** (`lib/dates.ts`): tanggal `YYYY-MM-DD` diperlakukan sebagai *plain date* (tanpa zona waktu) — jangan `new Date('2026-11-01')` (UTC) lalu ditampilkan lokal; gunakan `parse(str, 'yyyy-MM-dd', new Date())` dari date-fns. Fungsi: `diffDays`, `addDays`, `durationInclusive`, `rangeOverlap`, `eachDay`, `isWeekend`.

## Implementation Steps
- [ ] **List View:**
  - Tabel interaktif tree (`getSubRows` dari `parent_task_id`), caret expand/collapse, indentasi per depth.
  - Kolom: Checkbox (pilih baris → aksi massal: ubah status, hapus), Title, Assignee, Status, Priority, Start, End, Tags.
  - Kolom bisa di-resize (`columnResizeMode: 'onChange'`), header sortable (sort di klien untuk data yang sudah dimuat).
  - Inline edit: title (klik dua kali), status/priority/assignee (dropdown), tanggal (date picker).
  - Baris "+ Tambah task" di bawah tabel; menu ⋯ per baris (Tambah subtask, Buka, Hapus dengan konfirmasi).
  - Klik baris untuk membuka Task Detail page (route `/t/:taskId`).
  - Virtualisasi baris bila > 100 baris.
- [ ] **Board View:**
  - Kolom per status (To Do, In Progress, In Review, Done) + jumlah card; `GET ...tasks?view=board`.
  - Card: title, avatar assignee (human/agent), badge status agent (TASK_007), rentang tanggal, priority, jumlah subtask; klik → Task Detail.
  - Implementasi drag-and-drop card untuk mengubah status task: pindah kolom → `PATCH /tasks/:id {status}` lalu `PATCH /tasks/reorder` untuk kolom tujuan; reorder dalam kolom → `PATCH /tasks/reorder`. Optimistic + rollback.
  - Keyboard: dnd-kit `KeyboardSensor` (Space angkat, panah pindah, Space taruh, Esc batal) + announcement screen reader.
  - Quick add di bawah tiap kolom (status = kolom tersebut); toggle "Tampilkan subtask".
- [ ] **Timeline View:**
  - Layout dua panel: kiri tree (judul + assignee, expand/collapse, indentasi visual untuk Subtask), kanan chart; scroll vertikal tersinkron.
  - Render sumbu waktu (X-axis) dengan zoom **Hari** (lebar 40 px/hari) dan **Minggu** (16 px/hari); header bulan + tanggal/minggu; garis "Hari ini"; shading Sabtu–Minggu. Tombol "Ke hari ini".
  - Render list task (Y-axis) dan batang (bar) berdasarkan `start_date` dan `end_date` (`offset_days`, `duration_days` dari API). Warna = status; task agent memakai pola stripe/ikon robot; milestone = belah ketupat; baris grup tanpa tanggal tidak punya bar; `outside_parent_range` diberi outline peringatan.
  - Implementasi drag-and-drop pada batang untuk mengubah tanggal (reschedule): geser seluruh bar (snap per hari), tarik tepi kiri/kanan untuk mengubah durasi (minimal 1 hari; milestone hanya bisa digeser). Tooltip tanggal selama drag.
  - On drop: hitung tanggal baru → jika task punya turunan bertanggal **dan** `start_date` berubah → tampilkan dialog cascade ("Geser juga N subtask?" → `shift` / `none` / batal) → `PATCH /tasks/:id/reschedule`. Jika API mengembalikan 409 `CASCADE_DECISION_REQUIRED` (data basi) → tampilkan dialog. Optimistic update semua task yang bergeser; rollback jika gagal.
  - Panel **"Belum dijadwalkan"** (task dari `unscheduled`): tombol "Atur tanggal" membuka date range picker (drag dari panel ke chart = nice-to-have).
  - Virtualisasi baris (TanStack Virtual) & hanya render kolom tanggal yang terlihat (horizontal windowing) agar 1000 task tetap lancar.
  - Keyboard alternatif drag: fokus bar → panah kiri/kanan geser 1 hari, Shift+panah ubah durasi, Enter simpan.
- [ ] **View Switcher:** segmented control di header untuk berpindah antar view tanpa reload halaman (state di URL `?view=` + Zustand untuk preferensi), filter tetap terbawa.
- [ ] **State kosong/loading/error** di setiap view sesuai mockup TASK_004.

## Acceptance Criteria
- Data task tampil konsisten di ketiga view: perubahan di satu view (atau dari user/agent lain via real-time) terlihat di view lain tanpa reload.
- Drag-and-drop di Board dan Timeline berhasil mengupdate data di backend (status, urutan, tanggal) dan bertahan setelah reload.
- Reschedule parent yang punya subtask menampilkan dialog cascade dan hasilnya sesuai pilihan (UC5).
- Timeline view mampu menampilkan minimal 100 task tanpa lag, dan **target 1000 task** dengan scroll lancar serta interaksi drag < 100 ms (virtualization).
- Task tanpa tanggal tampil di panel "Belum dijadwalkan".
- Board bisa dioperasikan dengan keyboard.
- Viewer tidak bisa drag/edit di ketiga view.

## Testing
- Unit: `lib/dates.ts` (termasuk pergantian bulan/tahun & zona waktu Asia/Jakarta vs UTC), konversi posisi piksel ↔ tanggal timeline, builder tree list, `updateTaskInCaches`.
- Component: Board drag (dnd-kit test utils / keyboard), dialog cascade.
- E2E (TASK_008): E2E-01, E2E-05, E2E-06.
- Performa: seed 1000 task (`pnpm --filter api db:seed:large`), ukur FPS scroll & durasi interaksi di Chrome Performance.
