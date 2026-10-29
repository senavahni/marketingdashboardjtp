# Product Requirements Document (PRD)
## Modul 1: Agentic Project Management (Notion-like + Timeline)

| | |
|---|---|
| Versi | 1.1 |
| Status | Draft — menunggu review |
| Dokumen terkait | [README](README.md), [Use Cases](M1_USE_CASES.md), [Architecture](M1_ARCHITECTURE.md), [MCP Integration](M1_MCP_INTEGRATION.md) |

---

### 1. Visi Modul
Menciptakan ruang kerja proyek yang fleksibel, terstruktur, dan kolaboratif antara Manusia dan Agentic AI. Modul ini menggabungkan kebebasan struktur dokumen (Notion-like) dengan ketatnya manajemen waktu (Timeline/Gantt), di mana AI Agent bertindak sebagai rekan tim yang otonom.

### 2. Tujuan & Ukuran Keberhasilan

| Tujuan | Indikator keberhasilan (saat UAT) |
|---|---|
| Tim marketing dapat merencanakan proyek dengan timeline | UC1 dapat diselesaikan user baru dalam < 5 menit tanpa bantuan |
| Agent dapat diperlakukan sebagai anggota tim | UC2–UC4 berjalan end-to-end (dengan MCP Server/Mock MCP) tanpa intervensi manual di database |
| Kolaborasi terasa real-time | Perubahan dari agent/user lain tampil di layar user < 2 detik |
| Aman untuk dipakai multi-tim | Tidak ada temuan kritis XSS/IDOR saat security testing (TASK_008) |

### 3. Persona & Peran

| Persona | Contoh | Kebutuhan |
|---|---|---|
| Marketing Manager | Reviewer konten (UC4) | Melihat progres, review hasil agent, memberi arahan via komentar |
| Marketing Staff | Pembuat task (UC1) | Membuat task/subtask, mengatur jadwal, mendelegasikan ke agent |
| AI Agent | `@Agent_Strategist` | Menerima task, membaca konteks, menulis hasil, membuat subtask, berkomentar |
| Workspace Admin | Lead tim | Mengelola member, role, dan daftar agent |

**Role (RBAC per workspace):**

| Role | Ringkasan hak |
|---|---|
| Owner | Semua hak Admin + hapus workspace, transfer ownership. Tepat 1 per workspace |
| Admin | Kelola member (kecuali Owner) & agent, hapus project apa pun |
| Member | Buat/ubah project, task, blok, komentar; assign ke user/agent; hapus project/task buatannya |
| Viewer | Hanya baca (default README D5) |

Matriks lengkap ada di [TASK_001 §RBAC](M1_TASK_001_INFRA_SECURITY_DB.md#rbac).

### 4. Fitur Unggulan yang Diadopsi (Inspirasi Notion)
1. **Block-Based Editor:** Konten tugas/proyek bukan sekadar teks panjang, melainkan kumpulan blok (teks, heading, checklist, tabel, embed link, AI prompt block).
2. **Hierarchical Structure:** Workspace → Project → Task → Subtask (maksimal **3 level task**: Task → Subtask → Sub-subtask).
3. **Multiple Views:** Data yang sama bisa dilihat dalam bentuk List (Table), Board (Kanban), dan Timeline (Gantt).
4. **Rich Metadata & Timeline:** Setiap task memiliki properti: Assignee (Human/Agent), Status, Priority, Start Date, End Date, dan Tags.
5. **Contextual Collaboration:** Fitur comment, mention (`@user` atau `@agent_name`), dan activity log di setiap halaman/blok.

### 5. Requirement Fungsional

| ID | Requirement | Prioritas | Task |
|---|---|---|---|
| FR-01 | Register, login, logout, refresh sesi | P0 | 001 |
| FR-02 | Workspace: buat, ubah, lihat; kelola member & role | P0 | 002 |
| FR-03 | Kelola agent di workspace (tambah, ubah, nonaktifkan) | P0 | 002 |
| FR-04 | CRUD project (soft delete beserta seluruh isinya) | P0 | 002 |
| FR-05 | CRUD task & subtask hingga 3 level; pindah parent tanpa circular reference | P0 | 002 |
| FR-06 | Properti task: status, priority, assignee (user/agent), start/end date, milestone, tags | P0 | 002 |
| FR-07 | Block editor di task dan di **Project Brief** (halaman dokumen level project) | P0 | 003, 005 |
| FR-08 | Blok: paragraph, heading H1–H3, bullet, numbered, checklist, quote, table, divider, image (URL), code, embed link | P0 | 005 |
| FR-09 | Blok AI Prompt (jalankan prompt ke agent dari dalam dokumen) | P1 | 003, 005 |
| FR-10 | Slash command `/` dan mention `@` (user & agent) | P0 | 005 |
| FR-11 | Auto-save blok tanpa mengganggu pengetikan | P0 | 003, 005 |
| FR-12 | List view: tabel tree, resize kolom, sort, filter, inline edit | P0 | 006 |
| FR-13 | Board view: kolom per status, drag & drop mengubah status/urutan | P0 | 006 |
| FR-14 | Timeline view: bar Gantt, drag untuk geser, tarik tepi untuk ubah durasi, milestone, indentasi subtask, cascade reschedule | P0 | 003, 006 |
| FR-15 | Assign task ke agent memicu dispatch ke MCP Server | P0 | 002 |
| FR-16 | Estimasi waktu oleh agent mengisi tanggal task yang kosong | P0 | 002 |
| FR-17 | Agent dapat: mengubah status, menulis/ubah blok, membuat subtask, berkomentar (via webhook) | P0 | 003 |
| FR-18 | Agent dapat membaca konteks project (Agent API + full-text search) | P0 | 003 |
| FR-19 | Komentar ber-thread di task/project/blok, dengan mention; mention agent memicu agent | P0 | 002, 007 |
| FR-20 | Activity log per task & project | P0 | 002, 007 |
| FR-21 | Notifikasi in-app (lonceng + toast) real-time | P0 | 002, 007 |
| FR-22 | Indikator status agent (Menunggu, Thinking, Working, Done, Gagal + retry) | P0 | 007 |
| FR-23 | Update real-time task, blok, komentar tanpa refresh | P0 | 003, 007 |

### 6. Spesifikasi Timeline & Scheduling
* **Task & Subtask:** Mendukung penentuan `start_date` dan `end_date` (tipe tanggal tanpa jam, inklusif). Keduanya opsional; task tanpa tanggal lengkap ditampilkan di panel "Belum dijadwalkan" pada Timeline.
* **Validasi:** `end_date ≥ start_date`. Tanggal subtask **boleh** di luar rentang parent (tidak diblokir), tetapi ditandai visual di Timeline.
* **Timeline View (Gantt):** Visualisasi batang (bar) berdasarkan durasi task. Mendukung *drag-and-drop* untuk mengubah tanggal mulai/selesai (rescheduling) dan tarik tepi bar untuk mengubah durasi. Skala hari & minggu.
* **Cascade Reschedule:** Jika task yang punya subtask digeser, user memilih: geser semua subtask dengan selisih hari yang sama, atau hanya task itu.
* **Milestone:** Task khusus yang menandai titik penting dalam proyek (durasi 0 hari, `start_date = end_date`, wajib bertanggal), ditampilkan sebagai belah ketupat.
* **Agent Time Estimation:** Saat task di-assign ke AI Agent dan tanggal belum diisi, Agent memberikan estimasi waktu pengerjaan yang langsung mengisi `start_date` dan `end_date`. Tanggal yang sudah diisi user **tidak** ditimpa.

### 7. Integrasi Agentic AI
* Agent dapat ditugaskan layaknya user manusia (satu assignee per task: user **atau** agent).
* Agent dapat membaca konteks proyek (via Agent API/MCP) dan menulis/mengupdate blok di dalam task.
* Agent dapat membuat subtask turunan secara otomatis jika task yang diberikan terlalu kompleks (tetap mengikuti batas 3 level).
* Agent dapat dipanggil lewat mention di komentar (`@Agent_Strategist ...`).
* Semua aksi agent tercatat di activity log dengan aktor bertipe `agent`.
* Batasan keamanan: agent hanya dapat menulis ke task yang sedang ia kerjakan (punya *agent run* aktif) beserta subtask-nya. Mention dari agent ke agent lain **tidak** memicu agent lain di M1 (mencegah loop).
* Kontrak teknis: [M1_MCP_INTEGRATION.md](M1_MCP_INTEGRATION.md).

### 8. Requirement Non-Fungsional

| ID | Kategori | Requirement |
|---|---|---|
| NFR-01 | Performa | API blok (GET task blocks, batch save ≤ 50 operasi) p95 < 200 ms dengan 1000 blok/task |
| NFR-02 | Performa | API timeline p95 < 500 ms untuk 1000 task/project |
| NFR-03 | Performa | Timeline & List tetap responsif (scroll tanpa patah, interaksi < 100 ms) untuk 1000 task |
| NFR-04 | Performa | Mengetik di editor tanpa lag (tidak ada long task > 50 ms akibat auto-save) |
| NFR-05 | Real-time | Event tampil di klien lain < 2 detik |
| NFR-06 | Keamanan | JWT + refresh token rotation, argon2id, RBAC, rate limit, validasi schema blok, HMAC webhook, anti-IDOR |
| NFR-07 | Keandalan | MCP Server down tidak mengganggu operasi user; dispatch di-retry otomatis dan status gagal terlihat |
| NFR-08 | Ketersediaan | Target 99,5% jam kerja untuk lingkungan produksi internal |
| NFR-09 | Browser | Chrome, Edge, Firefox, Safari — 2 versi major terakhir; desktop ≥ 1280 px (dukungan minimal 1024 px) |
| NFR-10 | Bahasa & zona waktu | UI Bahasa Indonesia (teks dikelola di file i18n). Zona waktu default workspace `Asia/Jakarta` |
| NFR-11 | Aksesibilitas | Kontras WCAG 2.1 AA; perbedaan Human vs Agent tidak hanya mengandalkan warna; drag & drop punya alternatif keyboard |
| NFR-12 | Kualitas | Coverage test backend ≥ 80%; E2E untuk UC1–UC4 |
| NFR-13 | Observability | Error tracking (Sentry), log terstruktur dengan `request_id` & `run_id` |

### 9. Di Luar Scope Modul 1
- Co-editing simultan level karakter (CRDT/Yjs). M1 memakai penyimpanan per-blok dengan optimistic locking.
- Dependensi antar task (panah finish-to-start) di Gantt.
- Upload file/gambar (image hanya via URL).
- Notifikasi email/push, aplikasi mobile.
- SSO/OAuth, undangan member via email (member ditambahkan berdasarkan email user yang sudah terdaftar).
- Permission per project (README D7), trash/restore UI.
- Recurring task, template, import/export.
- RAG berbasis vector embedding (M1 memakai PostgreSQL full-text search).

### 10. Teknologi
* **Frontend**: React (19.3 atau versi stable terbaru) & TypeScript (7.0.2 atau versi stable terbaru), Vite SPA.
* **Backend**: NestJS v12.2.0 atau versi stable terbaru.
* **Database**: PostgreSQL (17) + Redis (7).
* Kompatibilitas TypeScript 7 dengan decorator NestJS harus diverifikasi di spike Sprint 0 (README D1). Detail stack lengkap di [M1_ARCHITECTURE.md §2](M1_ARCHITECTURE.md#2-tech-stack).

### 11. Glosarium

| Istilah | Arti |
|---|---|
| Block | Satu unit konten di editor (paragraf, heading, checklist, dll.), disimpan sebagai baris `document_blocks` |
| Project Brief | Dokumen block editor milik project (bukan milik task), sumber konteks utama agent |
| Agent | AI Agent yang terdaftar di workspace dan dijalankan oleh MCP Server |
| Agent Run | Satu sesi kerja agent atas sebuah task (dari dispatch/mention/prompt block hingga selesai/gagal) |
| MCP Server | Custom MCP Server (Project 2) yang menjalankan agent |
| Dispatch | Pengiriman task ke MCP Server agar agent mulai bekerja |
| Cascade reschedule | Menggeser subtask mengikuti pergeseran parent |
| Milestone | Task berdurasi 0 hari penanda titik penting |

### 12. Kriteria Rilis Modul 1
1. Semua FR P0 selesai; FR P1 selesai atau dinonaktifkan via feature flag.
2. UC1–UC4 lulus UAT di staging (dengan MCP Server Project 2 jika sudah siap, atau Mock MCP).
3. Semua kriteria di [TASK_008](M1_TASK_008_QA_DEPLOYMENT.md) terpenuhi.
