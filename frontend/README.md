# Frontend — Modul 1 (React, ala Notion)

React 19 + Vite + TypeScript 7. Mengimplementasikan **M1_TASK_005** (block editor), **M1_TASK_006** (Tabel, Board, Timeline)
dan **M1_TASK_007** (kolaborasi agent & real-time). Cara menjalankan: lihat [README root](../README.md).

## Pengalaman ala Notion
- **Sidebar**: workspace switcher, Beranda, Inbox (notifikasi + badge), Pengaturan, daftar Proyek (ikon emoji), daftar AI Agents. Bisa disembunyikan.
- **Halaman proyek**: ikon + judul besar yang bisa diedit langsung, tab view **Brief · Tabel · Board · Timeline**, pencarian & filter "Milik saya", tombol **Baru**.
- **Side peek**: task terbuka di panel kanan (`?p=<taskId>`), bisa dibuka sebagai halaman penuh (`/w/:ws/t/:taskId`). Esc / klik di luar untuk menutup.
- **Properti** gaya Notion (Status, Assignee, Tanggal + milestone, Prioritas, Tag, Dibuat oleh) — klik untuk mengubah.
- **Block editor** (BlockNote): slash command `/`, mention `@` (Humans & AI Agents), drag handle blok, toggle, tabel, checklist, kode,
  gambar via URL, embed link, divider, AI Prompt (feature flag). Auto-save per blok dengan optimistic locking.
- **Tabel**: tree subtask (expand/collapse), resize kolom, inline edit, pilih baris → aksi massal, baris "+ Baru", virtualisasi.
- **Board**: kolom per status, drag & drop (mouse & keyboard), quick add per kolom, toggle subtask.
- **Timeline**: Gantt custom — geser bar, tarik tepi (durasi), milestone ◆, garis hari ini, shading akhir pekan, zoom hari/minggu,
  dialog **cascade** ("Geser juga N subtask?"), panel "Belum dijadwalkan", navigasi keyboard (←/→, Shift+→).
- **Agent**: avatar agent kotak + ikon robot (beda bentuk, bukan hanya warna), badge Menunggu / Thinking… / Working… / Done / Gagal,
  banner "Agent sedang menulis…", tombol Coba lagi / Hentikan, indikator mengetik di komentar.
- **Real-time** (Socket.IO): perubahan task, blok, komentar, aktivitas, status agent & notifikasi tampil tanpa reload; toast untuk event agent.

## Struktur
```
src/
├── main.tsx                 # router, provider, bootstrap sesi (refresh cookie → /auth/me)
├── index.css                # Tailwind + palet ala Notion
├── lib/                     # api client (refresh single-flight), auth store, query keys, realtime, dates, types
├── hooks/queries.ts         # TanStack Query: query & mutation (optimistic update)
├── pages/                   # Auth, WorkspaceHome, ProjectPage, TaskPage
└── components/
    ├── layout/              # AppLayout, Sidebar
    ├── views/               # TableView, BoardView, TimelineView (+ timeline-model)
    ├── task/                # TaskPanel (peek/halaman), property editors
    ├── editor/              # BlockEditor, schema (mention, bookmark, aiPrompt), adapters (diff auto-save)
    ├── collab/              # Comments, ActivityFeed, Inbox, RealtimeBridge
    ├── settings/            # Anggota & AI Agents
    └── ui/                  # button, avatar, popover, dialog, chip, badge
```

## Script
| Script | Fungsi |
|---|---|
| `npm run dev` | Vite dev server (port `FRONTEND_PORT`, proxy `/api` & `/socket.io` ke backend `PORT`) |
| `npm run build` | Typecheck + build produksi ke `dist/` |
| `npm run preview` | Pratinjau hasil build |
| `npm test` | Unit test (Vitest) |
| `npm run typecheck` | `tsc` |

## Konfigurasi
Dibaca dari **`.env` di root** (`envDir: '..'`). Hanya variabel `VITE_*` yang masuk ke bundle browser:
`VITE_API_URL` (default `/api/v1`), `VITE_WS_PATH` (default `/socket.io`), `VITE_FEATURE_AI_PROMPT_BLOCK`.

## Docker
Image dibangun dari root dengan [`Dockerfile.frontend`](../Dockerfile.frontend) dan disajikan nginx ([`nginx.conf`](../nginx.conf)) yang juga mem-proxy `/api`, `/socket.io`, `/health` ke container backend.

## Catatan teknis
- Tabel dibuat custom (bukan TanStack Table v9 yang API-nya baru berubah besar); virtualisasi memakai TanStack Virtual.
- Gantt dibuat custom (keputusan D2): tanpa lisensi berbayar, mendukung hierarki & 1000 task (virtualisasi baris, grid via CSS gradient).
- Semua view memakai satu cache task per proyek (`['tasks', projectId]`) sehingga perubahan di satu view langsung konsisten di view lain.
- Tanggal `YYYY-MM-DD` diperlakukan sebagai *plain date* (aritmatika UTC) agar tidak bergeser karena zona waktu.
