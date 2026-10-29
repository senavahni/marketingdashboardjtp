# Task: Frontend Block Editor Implementation
**ID:** M1_TASK_005
**Status:** To Do
**Dependencies:** M1_TASK_004, M1_TASK_003
**Estimasi:** 8 person-days (Frontend)
**Acuan:** format blok & API di [TASK_003](M1_TASK_003_BACKEND_BLOCK_TIMELINE_API.md#block-format)

## Objective
Mengimplementasikan editor dokumen block-based (Notion-like) di Frontend untuk **Task Detail** dan **Project Brief**, lengkap dengan slash command, mention, auto-save yang tidak mengganggu pengetikan, dan penerimaan update dari agent.

## Tech Stack
- **Dipilih: BlockNote** (berbasis Tiptap/ProseMirror) — paling dekat dengan pengalaman Notion out-of-the-box (slash menu, side menu drag handle, nested blocks, table) dan model datanya per-blok, cocok dengan tabel `document_blocks`.
  - Gunakan **hanya paket core** (`@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn` atau `@blocknote/mantine`) yang berlisensi MPL-2.0. **Jangan** memakai paket "XL"/AI/multi-column BlockNote yang berlisensi GPL/komersial tanpa persetujuan.
  - Verifikasi saat setup: format ID blok (harus UUID; jika bukan, konfigurasi generator ID) dan nama tipe/props blok sesuai tabel TASK_003.
- Fallback: **Tiptap** langsung (lebih banyak kerja manual untuk slash menu & drag handle).

## Struktur Kode
```
apps/web/src/features/editor/
├── BlockEditor.tsx            # komponen generik: scope = { project_id, task_id | null }, readOnly
├── TaskEditor.tsx             # wrapper untuk Task Detail
├── ProjectBriefEditor.tsx     # wrapper untuk Project Brief
├── schema.ts                  # BlockNote schema (blok default yang diizinkan + custom blocks + mention)
├── blocks/                    # Divider, Bookmark, AiPrompt
├── inline/Mention.tsx
├── slashMenu.ts               # item & alias Bahasa Indonesia
├── adapters.ts                # API Block[] <-> BlockNote Block[] (tree)
├── diff.ts                    # hitung operasi batch dari perubahan dokumen
├── useAutoSave.ts             # antrian, debounce, retry, konflik
└── useRemoteBlocks.ts         # terapkan event real-time (dipakai TASK_007)
```

## Implementation Steps
- [ ] **Setup** BlockNote di React (Vite) dengan tema yang memakai token design system TASK_004.
- [ ] **Schema:** aktifkan hanya blok yang diizinkan (TASK_003): paragraph, heading (level 1–3 saja), bulletListItem, numberedListItem, checkListItem (Todo), quote, codeBlock, table, image; **nonaktifkan** audio, video, file, dan upload gambar (image hanya via URL).
- [ ] Implementasi blok dasar: Text, Heading (H1–H3), Bullet List, Numbered List, Checklist (Todo).
- [ ] Implementasi blok lanjutan: Divider, Image Embed (URL), Code Block, **Table**, **Embed Link** (custom `bookmark`: input URL → kartu dengan URL/judul yang diisi user; **tidak** mengambil metadata dari server lain di M1 untuk menghindari SSRF).
- [ ] **AI Prompt Block (P1, flag `VITE_FEATURE_AI_PROMPT_BLOCK`):** custom block berisi textarea prompt, pemilih agent (dari `/assignees`), tombol **Jalankan** → `POST /blocks/:id/run`; tampilkan status `running` (spinner), `completed`, `failed` (+ Coba lagi). Blok terkunci (read-only) saat `running`.
- [ ] Implementasi fitur **"Slash Command"** (`/`) untuk memunculkan menu pilihan blok (seperti di Notion), dengan label & alias Bahasa Indonesia (mis. `/judul`, `/daftar`, `/tabel`, `/kode`, `/ai`) sekaligus alias Inggris.
- [ ] **Mention System:** Implementasi fitur `@` untuk mention User atau Agent.
  - Custom inline content `mention` dengan props `{ mention_type, id, label }` (format TASK_003).
  - `SuggestionMenuController` dengan trigger `@` → panggil `GET /workspaces/:id/assignees?q=` (debounce 150 ms, cache TanStack Query) → dropdown dengan section **Humans** & **AI Agents**.
  - Render chip: human = `@Nama`, agent = ikon robot + `@Agent_Strategist` dengan warna aksen agent.
- [ ] **Load dokumen:** `GET /tasks/:id/blocks` atau `/projects/:id/brief/blocks` → `adapters.toEditorBlocks()` → `initialContent`. Dokumen kosong → satu paragraph kosong (belum disimpan sampai diketik). Simpan peta `blockId → { version, hash }` sebagai *snapshot tersimpan*.
- [ ] **Debouncing & Auto-save** (`useAutoSave`):
  1. `onChange` editor hanya menandai *dirty* (tidak melakukan kerja berat di handler pengetikan).
  2. Setelah **2 detik tanpa perubahan** (atau maksimum 10 detik sejak perubahan pertama), jalankan `diff(snapshot, editor.document)` → operasi `upsert` (blok baru/berubah, termasuk perubahan parent/urutan) & `delete`. Bandingkan via hash `JSON.stringify({type, props, content, parent, order})` per blok — O(n).
  3. Kirim `POST /api/v1/blocks/batch` dengan `expected_version` dari snapshot. Hanya **satu request in-flight**; perubahan selama request berjalan dikumpulkan untuk batch berikutnya.
  4. Sukses → perbarui snapshot (versi baru). Gagal jaringan/5xx → retry backoff (2, 4, 8, … maks 30 s), status "Gagal menyimpan — Coba lagi".
  5. Flush segera saat: editor blur, `visibilitychange` ke hidden, pindah route, menutup panel task. `beforeunload` menampilkan peringatan bila masih ada perubahan belum tersimpan.
  6. Indikator status di pojok editor: "Menyimpan…" / "Tersimpan" / "Gagal menyimpan".
  7. Viewer: editor `editable = false`, auto-save nonaktif.
- [ ] **Konflik versi:** untuk setiap item `conflicts` di respons batch → ganti blok lokal dengan `server_block` (versi server menang), perbarui snapshot, dan tampilkan toast "Blok ini telah diubah oleh {aktor}. Versi terbaru dimuat." Perubahan lokal pada blok lain tetap tersimpan.
- [ ] **Update remote (dasar, dilanjutkan TASK_007):** `useRemoteBlocks` menerima event `block.upserted`/`block.deleted`/`blocks.reordered` (abaikan jika `origin_client_id` = client ini) → terapkan via `editor.updateBlock` / `insertBlocks` / `removeBlocks` dengan flag `isApplyingRemote` agar **tidak memicu auto-save**; perbarui snapshot. Jika kursor user sedang berada di blok yang sama → tunda dan tampilkan banner "Muat versi terbaru".
- [ ] **Sanitasi di frontend:** validasi dokumen dengan schema Zod `packages/shared` sebelum dikirim; link toolbar menolak URL selain http/https/mailto; paste HTML dibatasi oleh schema BlockNote (tag tak dikenal menjadi teks). Tidak ada `dangerouslySetInnerHTML` (kecuali lewat komponen `SafeHtml` + DOMPurify).
- [ ] Integrasi dengan API `/api/v1/blocks` (batch untuk auto-save; endpoint tunggal untuk aksi eksplisit bila perlu).
- [ ] **Penanda blok agent:** blok dengan `last_edited_by.type = agent` menampilkan indikator kecil (ikon robot di side menu + tooltip "Ditulis oleh Agent_Strategist").
- [ ] **Aksesibilitas & keyboard:** shortcut standar (Ctrl/Cmd+B/I/U, Tab/Shift+Tab untuk indent list, Ctrl/Cmd+Z undo). Undo tidak membatalkan update remote.

## Acceptance Criteria
- User bisa mengetik, menggunakan slash command, dan membuat checklist, heading, list, table, divider, image URL, code block, embed link.
- Auto-save berfungsi tanpa mengganggu performa ketik (no lag): tidak ada long task > 50 ms saat mengetik di dokumen 1000 blok (diukur via Performance panel), dan perubahan tersimpan ≤ 3 detik setelah berhenti mengetik.
- Menutup tab dengan perubahan belum tersimpan memunculkan peringatan; reload setelah "Tersimpan" menampilkan konten yang sama persis.
- Mention `@Agent` berhasil menyimpan ID agent di dalam metadata blok (`content_json` → inline `mention` dengan `mention_type: "agent"` dan `id`).
- URL `javascript:alert(1)` tidak dapat disimpan sebagai link/gambar/bookmark; teks `<script>alert(1)</script>` tampil sebagai teks biasa.
- Blok yang ditambahkan agent muncul tanpa refresh dan tidak memicu auto-save balik.
- Viewer melihat dokumen read-only.

## Testing
- Unit (Vitest): `adapters` (round-trip API ↔ BlockNote, nested), `diff` (insert, update, delete, pindah parent, reorder), `useAutoSave` (debounce, max-wait, single in-flight, retry, konflik) dengan fake timers.
- Component test (Testing Library): slash menu memfilter item, mention menampilkan dua section.
- E2E (TASK_008): E2E-02 (mengetik brief), E2E-03 (blok agent muncul), E2E-04 (update blok oleh agent).
