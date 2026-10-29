# User & Agent Use Cases - Modul 1

Setiap use case berisi aktor, prasyarat, alur utama, alur alternatif/error, dan hasil akhir. Data contoh mengikuti seed ([M1_ARCHITECTURE §10](M1_ARCHITECTURE.md#10-menjalankan-modul-1-secara-lokal)). Kode `E2E-xx` merujuk ke skenario Playwright di [TASK_008](M1_TASK_008_QA_DEPLOYMENT.md).

---

### UC 1: Pembuatan Proyek & Task dengan Timeline (Human)
- **Aktor:** Member/Admin/Owner
- **Prasyarat:** User login dan menjadi anggota workspace (role ≥ Member).

**Alur utama**
1. User membuat Project "Q4 Product Launch" dari sidebar (tombol "+ Project").
2. User membuat Task "Market Research" (quick add di List view).
3. User membuka properti Task, mengatur `start_date` (1 Nov) dan `end_date` (5 Nov).
4. User membuat Subtask "Scrape Twitter" dan "Scrape Meta" di dalam Task tersebut (dari Task Detail → "+ Subtask").
5. User beralih ke **Timeline View**, melihat batang Gantt untuk Task dan Subtask (subtask terindentasi di bawah parent), lalu melakukan *drag-and-drop* Subtask "Scrape Meta" agar beririsan dengan "Scrape Twitter" (paralel).
6. Sistem menyimpan tanggal baru, mencatat activity `task.rescheduled`, dan menampilkan perubahan ke user lain yang membuka project yang sama secara real-time.

**Alur alternatif / error**
- 3a. User mengisi `end_date` < `start_date` → date picker menolak; jika lewat API → 422 `INVALID_DATE_RANGE`.
- 4a. User mencoba membuat subtask di level ke-4 → tombol "+ Subtask" disembunyikan di level 3; API → 422 `HIERARCHY_DEPTH_EXCEEDED`.
- 5a. Subtask belum punya tanggal → tampil di panel "Belum dijadwalkan"; user bisa klik "Atur tanggal".
- 5b. Gagal simpan (jaringan) → bar kembali ke posisi semula + toast error.

**Hasil akhir:** Project dengan 1 task, 2 subtask paralel, tampil konsisten di List, Board, Timeline. (E2E-01)

---

### UC 2: Delegasi Tugas ke Agentic AI (Human-to-Agent)
- **Aktor:** Member, Agent_Strategist, MCP Server
- **Prasyarat:** Agent `Agent_Strategist` aktif di workspace; MCP Server (atau Mock MCP) berjalan.

**Alur utama**
1. User membuat Task "Generate Content Calendar".
2. User mengetik brief di dalam Block Editor (auto-save).
3. User mengklik kolom Assignee, memilih `@Agent_Strategist` dari section "AI Agents".
4. Sistem menyimpan assignee, membuat *agent run* (status `queued`), dan menampilkan badge "Menunggu…" pada task. Request user selesai seketika (tidak menunggu MCP).
5. Karena task belum punya tanggal, worker memanggil `pm_request_agent_estimation`. Agent mengembalikan estimasi (mis. 2 hari mulai hari ini) dan pesan.
6. Sistem mengisi `start_date` & `end_date`, lalu menambahkan komentar dari agent: "Saya akan mengerjakan ini. Estimasi selesai 2 hari."
7. Worker memanggil `pm_dispatch_task_to_agent` dengan isi blok sebagai konteks. MCP membalas `accepted`.

**Alur alternatif / error**
- 5a. Task sudah punya tanggal → langkah 5–6 dilewati (tanggal user tidak ditimpa), langsung dispatch.
- 5b. Estimasi timeout/gagal → tanggal dibiarkan kosong, activity `agent.estimation_failed` dicatat, proses lanjut ke dispatch.
- 7a. MCP Server down → retry otomatis 5x dengan backoff. Jika tetap gagal: status agent "Gagal" + tombol **Coba lagi**, notifikasi ke user yang meng-assign.
- 3a. Agent nonaktif → tidak muncul di picker; via API → 422 `AGENT_INACTIVE`.
- 3b. User mengganti assignee ke orang lain saat agent bekerja → run dibatalkan (`pm_cancel_agent_run`), badge agent hilang.

**Hasil akhir:** Task ter-assign ke agent, bertanggal, dan agent mulai bekerja. (E2E-02)

---

### UC 3: Eksekusi Otonom oleh Agent (Agent-to-System)
- **Aktor:** Agent_Strategist (via MCP Server)
- **Prasyarat:** UC2 selesai sampai dispatch diterima.

**Alur utama**
1. Agent_Strategist mulai bekerja: event `agent.task.started` → status task menjadi `in_progress`, badge "Working…".
2. Agent menyadari brief kurang detail, ia memanggil `pm_query_project_context` (MCP Server membaca Agent API Dashboard) untuk membaca **Project Brief** dan blok relevan lain. Selama itu event `agent.status.changed` (`thinking`) menampilkan "Thinking…".
3. Agent menulis hasil kerjanya langsung ke dalam Block Editor task (event `agent.block.appended`). User yang sedang membuka task melihat blok muncul tanpa refresh; activity log mencatat "Agent_Strategist memperbarui konten".
4. Agent membuat 3 Subtask turunan: "Draft Week 1", "Draft Week 2", "Draft Week 3" (event `agent.subtask.created`). Subtask tampil di List & Timeline.
5. Agent menyelesaikan task utama (event `agent.task.completed`) → status `done`, badge "Done". User yang meng-assign dan pembuat task mendapat notifikasi + toast.

**Alur alternatif / error**
- 3a. User sedang mengedit blok yang sama dengan yang diupdate agent → perubahan agent ditahan dan muncul banner "Agent memperbarui blok ini — Muat versi terbaru".
- 4a. Subtask melebihi 3 level → webhook ditolak 422 `HIERARCHY_DEPTH_EXCEEDED`; MCP harus membuat subtask di level yang valid.
- 5a. Agent gagal (`agent.task.failed`) → status task tidak diubah, badge "Gagal" + pesan error, notifikasi ke user, tombol **Coba lagi**.
- 5b. Tidak ada event selama 120 menit → run ditandai `failed` oleh sweeper.
- Webhook dengan signature salah / run tidak aktif → ditolak (401 / 409), tidak ada data berubah.

**Hasil akhir:** Task `done` berisi hasil kerja agent + 3 subtask; semua aksi tercatat dengan aktor agent. (E2E-03)

---

### UC 4: Kolaborasi & Review (Human)
- **Aktor:** Marketing Manager (Admin), Agent_Strategist
- **Prasyarat:** UC3 selesai.

**Alur utama**
1. Marketing Manager membuka task "Generate Content Calendar" (dari notifikasi atau Board).
2. Manager melihat blok teks yang ditulis Agent (blok bertanda "ditulis oleh Agent_Strategist"), dan memberikan komentar dengan me-mention `@Agent_Strategist`: "Tolong ubah tone di Week 2 menjadi lebih formal."
3. Sistem membuat *agent run* bertrigger `mention` dan memanggil `pm_notify_agent_mention` berisi komentar, thread, dan blok task.
4. Agent menerima notifikasi komentar, memprosesnya (badge "Thinking…" lalu "Working…"), dan mengupdate blok teks secara langsung (`agent.block.appended` dengan operasi `update`).
5. Agent membalas di thread komentar: "Sudah saya ubah." Manager menerima notifikasi.

**Alur alternatif / error**
- 2a. Manager me-mention user manusia → user tersebut mendapat notifikasi `comment_mention` (tidak memicu agent).
- 2b. Komentar me-mention agent yang nonaktif → komentar tersimpan, agent tidak dipicu, muncul info "Agent tidak aktif".
- 4a. Blok yang diupdate agent sudah diubah manusia setelah agent membaca → webhook dengan `expected_version` lama ditolak untuk blok itu (`VERSION_CONFLICT` di hasil), agent harus membaca ulang.

**Hasil akhir:** Konten diperbarui agent berdasarkan feedback, thread komentar lengkap. (E2E-04)

---

### UC 5: Reschedule Parent dengan Cascade (Human)
- **Aktor:** Member
1. User menggeser bar "Market Research" (punya 2 subtask) di Timeline 2 hari ke kanan.
2. Sistem menampilkan dialog: "Geser juga 2 subtask?" → **Geser semua** / **Hanya task ini** / Batal.
3. "Geser semua": parent dan seluruh subtask bertanggal bergeser +2 hari. "Hanya task ini": hanya parent.
4. Jika user hanya menarik tepi kanan (mengubah durasi), subtask tidak ikut bergeser dan dialog tidak muncul.
- **Error:** API tanpa parameter `cascade` untuk task yang punya subtask → 409 `CASCADE_DECISION_REQUIRED`. (E2E-05)

### UC 6: Mengubah Status via Board (Human)
1. User membuka Board view, menarik card dari "To Do" ke "In Progress".
2. Status tersimpan (optimistic update), urutan card dalam kolom tersimpan.
3. Card bisa dipindahkan dengan keyboard (fokus card → Space → panah → Space).
- **Error:** gagal simpan → card kembali ke kolom asal + toast. (E2E-06)

### UC 7: Kelola Member, Agent & Hak Akses
1. Owner/Admin membuka Settings → Members, menambahkan `viewer@demo.local` sebagai Viewer.
2. Viewer login: semua view dan task terlihat, tetapi editor read-only, tidak ada tombol tambah/hapus, tidak bisa drag di Board/Timeline, tidak bisa berkomentar.
3. Admin membuka Settings → Agents, menambahkan agent baru (nama, handle, `mcp_agent_key`), atau menonaktifkan agent.
4. User dari workspace lain (`outsider@demo.local`) yang mencoba membuka URL project ini mendapat halaman "Tidak ditemukan" (API 404).
- **Error:** menghapus/menurunkan satu-satunya Owner → 422 `LAST_OWNER`. (E2E-07)

### UC 8: Notifikasi
1. User mendapat notifikasi in-app untuk: di-assign task, di-mention, task yang ia assign ke agent selesai/gagal, agent berkomentar di task yang ia buat/assign.
2. Lonceng menampilkan jumlah belum dibaca (real-time); klik notifikasi membuka task terkait dan menandai terbaca; tersedia "Tandai semua dibaca". (E2E-08)

### UC 9 (P1): AI Prompt Block
1. User mengetik `/ai` di editor, memilih "AI Prompt", menulis prompt "Buatkan 5 ide headline", memilih `@Agent_Strategist`, klik **Jalankan**.
2. Sistem membuat agent run bertrigger `prompt_block` dan memanggil `pm_execute_prompt_block`.
3. Agent menulis hasil sebagai blok baru tepat di bawah prompt block; status block berubah "Selesai". (E2E-09, hanya jika feature flag aktif)

---

### Traceability

| Use case | FR | Task | Test |
|---|---|---|---|
| UC1 | FR-04, 05, 06, 12, 14 | 002, 003, 006 | E2E-01 |
| UC2 | FR-15, 16, 22 | 002, 007, 009 | E2E-02 |
| UC3 | FR-17, 18, 23 | 003, 005, 007, 009 | E2E-03 |
| UC4 | FR-19, 23 | 002, 003, 007 | E2E-04 |
| UC5 | FR-14 | 003, 006 | E2E-05 |
| UC6 | FR-13 | 002, 006 | E2E-06 |
| UC7 | FR-01, 02, 03 | 001, 002 | E2E-07 + IDOR suite |
| UC8 | FR-21 | 002, 007 | E2E-08 |
| UC9 | FR-09 | 003, 005 | E2E-09 |
