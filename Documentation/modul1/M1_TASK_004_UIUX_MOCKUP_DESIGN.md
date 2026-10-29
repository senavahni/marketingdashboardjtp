# Task: UI/UX Mockup & Design System
**ID:** M1_TASK_004
**Status:** To Do
**Dependencies:** — (bisa paralel dengan TASK_001; acuan fungsi: [PRD](M1_PRD.md), [Use Cases](M1_USE_CASES.md))
**Estimasi:** 8 person-days (UI/UX)

## Objective
Merancang wireframe dan high-fidelity mockup untuk Modul 1 sebelum coding frontend, termasuk design system yang langsung bisa dipetakan ke **Tailwind CSS + shadcn/ui** (stack frontend, lihat [ARCHITECTURE §2](M1_ARCHITECTURE.md#2-tech-stack)).

## Prinsip Desain
- Desktop-first: desain utama 1440 px, wajib tetap layak di 1280 px dan 1024 px. Mobile di luar scope (cukup tidak rusak).
- Bahasa UI: **Bahasa Indonesia**; istilah produk yang umum boleh tetap Inggris (Board, Timeline, Task).
- Perbedaan **Human vs Agent** tidak boleh hanya mengandalkan warna (bentuk avatar + ikon + label).
- Kontras teks minimal WCAG 2.1 AA (4.5:1 teks normal, 3:1 teks besar & elemen UI).
- Ikon: **lucide** (dipakai shadcn/ui).
- Light mode wajib; dark mode opsional (siapkan token agar mudah ditambah).

## Deliverables (Figma)

### 1. Design System
- [ ] **Token** sebagai Figma Variables dengan nama yang sama dengan CSS variables shadcn (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, `--destructive`, dll.) + token tambahan di bawah.
- [ ] **Typography:** font (rekomendasi Inter), skala: 12/14/16/20/24/30, line-height & weight; gaya khusus editor (H1/H2/H3, body, code).
- [ ] **Spacing & radius:** skala 4 px (4, 8, 12, 16, 24, 32, 48); radius 6/8/12.
- [ ] **Warna status task** (dipakai badge, kolom Board, bar Timeline):

  | Status | Label UI | Saran warna |
  |---|---|---|
  | `todo` | To Do | abu-abu (slate) |
  | `in_progress` | In Progress | biru |
  | `in_review` | In Review | kuning/amber |
  | `done` | Done | hijau |

- [ ] **Warna priority:** `none` (tanpa ikon), `low`, `medium`, `high`, `urgent` (ikon + warna).
- [ ] **Warna & identitas Agent vs Human:**
  - Human: avatar **lingkaran** (foto/inisial).
  - Agent: avatar **kotak membulat** dengan ikon robot (`bot`) + warna aksen agent (saran: violet) + label kecil "AI".
  - Bar Timeline task milik agent: pola garis/stripe atau ikon robot di bar.
- [ ] **Komponen dasar:** Button (primary, secondary, ghost, destructive; size sm/md; state hover/focus/disabled/loading), Input, Textarea, Select, Date picker, Date range picker, Checkbox, Badge, Avatar (Human/Agent/grup), Tooltip, Dropdown menu, Command palette/combobox, Dialog, Sheet (side panel), Tabs, Toast, Skeleton, Empty state, Segmented control.

### 2. Layar & Komponen
- [ ] **Auth:** Login, Register (dengan validasi error inline).
- [ ] **Sidebar Navigation:** Workspace switcher, list of projects (+ tombol tambah), list of agents (dengan status aktif), link Settings, lonceng notifikasi + badge jumlah belum dibaca, menu profil (logout).
- [ ] **Project View (Header):** Breadcrumb, Title (editable inline), ikon project, tombol **Brief**, Share/Members button (menampilkan avatar member), View Switcher (List | Board | Timeline), filter bar (status, assignee, priority, tag, pencarian), tombol "+ Task".
- [ ] **Project Brief page:** halaman dokumen block editor level project (layout seperti Task Detail tanpa panel properti task).
- [ ] **List/Table View Mockup:** Tabel task dengan kolom: Checkbox (pilih baris untuk aksi massal ubah status/hapus), Title (caret expand/collapse subtask + indentasi), Assignee (Avatar + Name/Agent Icon), Status, Priority, Start, End, Tags. Termasuk: resize kolom, header sortable, baris "+ Tambah task", menu baris (⋯: tambah subtask, hapus), inline edit, aksi massal.
- [ ] **Board/Kanban View Mockup:** Kolom berdasarkan Status (To Do, In Progress, In Review, Done) dengan jumlah card. Card menampilkan title, assignee, date, priority, jumlah subtask, dan **badge status agent**. State: card sedang di-drag, drop target, quick add di bawah kolom, toggle "Tampilkan subtask".
- [ ] **Timeline/Gantt View Mockup:** Panel kiri (tree: judul + assignee) dan kanan (chart). Sumbu waktu (zoom hari/minggu), garis "hari ini", shading akhir pekan, batang task berwarna status, milestone (belah ketupat), subtask terindentasi, expand/collapse, tanda "di luar rentang parent", panel **"Belum dijadwalkan"**. Fitur drag-and-drop visual: geser bar, tarik tepi kiri/kanan untuk durasi, tooltip tanggal saat drag.
- [ ] **Dialog Cascade Reschedule:** "Geser juga N subtask?" → Geser semua / Hanya task ini / Batal.
- [ ] **Task Detail Page (Side panel/Sheet dari kanan, bisa diperbesar ke full page):**
    - Kiri/Atas: Judul, Block Editor area.
    - Kanan/Bawah: Properties (Status, Priority, Assignee, Dates, Milestone toggle, Tags, dibuat oleh), daftar Subtask (+ tambah), tab **Komentar | Activity**.
- [ ] **Block Editor:** slash menu (`/`) dengan ikon & deskripsi tiap blok, mention dropdown (`@`) dengan section Humans/AI Agents, chip mention (beda untuk agent), side menu blok (drag handle ⋮⋮, +), toolbar format teks, blok Table, Divider, Image (input URL), Code, Embed link (bookmark card), **AI Prompt block** (prompt, pilih agent, tombol Jalankan, state running/selesai/gagal), indikator auto-save ("Menyimpan…", "Tersimpan", "Gagal menyimpan — Coba lagi"), penanda blok yang ditulis agent.
- [ ] **Agent Interaction UI:** Visual badge/tag untuk membedakan User dan Agent. Status agent: **Menunggu…**, **Thinking…** (animasi), **Working…** (animasi), **Done**, **Gagal** (+ tombol Coba lagi & detail error). Banner di editor "Agent_Strategist sedang menulis…". Indikator "agent sedang mengetik" di komentar. Banner konflik "Agent memperbarui blok ini — Muat versi terbaru".
- [ ] **Assignee Picker:** pencarian + section "Humans" dan "AI Agents" (ikon robot, deskripsi singkat agent), opsi "Tanpa assignee".
- [ ] **Komentar:** thread (1 level balasan), composer dengan mention, edit/hapus, label "(diedit)", komentar agent & komentar sistem (gaya berbeda).
- [ ] **Activity feed:** item dengan avatar aktor, kalimat aksi, waktu relatif; pengelompokan aksi beruntun.
- [ ] **Notifikasi:** dropdown/panel dari lonceng (belum dibaca ditebalkan, "Tandai semua dibaca"), toast pojok kanan bawah.
- [ ] **Settings → Members:** tabel member, ubah role, hapus, tambah member via email.
- [ ] **Settings → Agents:** daftar agent, form tambah/ubah (nama, handle, MCP agent key, deskripsi, avatar), toggle aktif.
- [ ] **State umum di setiap layar:** loading (skeleton), kosong (empty state + CTA), error (pesan + coba lagi), 404 "Tidak ditemukan", tampilan **read-only untuk Viewer**.

### 3. Prototype & Handoff
- [ ] Prototype klik (Figma) untuk alur **UC1–UC4** ([Use Cases](M1_USE_CASES.md)).
- [ ] Spesifikasi interaksi: durasi animasi, perilaku drag (snap per hari), shortcut keyboard (`/`, `@`, `Esc`, `Cmd/Ctrl+K` opsional).
- [ ] Handoff via Figma Dev Mode: semua komponen memakai Auto Layout & variables; aset ikon/ilustrasi diekspor SVG.
- [ ] Dokumen singkat pemetaan komponen Figma → komponen shadcn/ui.

## Acceptance Criteria
- Semua layar & state di atas tersedia sebagai high-fidelity mockup.
- Prototype UC1–UC4 dapat dijalankan di Figma.
- Token warna lolos cek kontras AA (dicek dengan plugin kontras).
- Mockup disetujui oleh stakeholder (catat nama & tanggal persetujuan di bawah).
- Asset dan komponen siap untuk di-implementasi di Frontend (developer frontend menyetujui handoff).

## Catatan Persetujuan
| Tanggal | Stakeholder | Status | Catatan |
|---|---|---|---|
| | | | |
