# Task: Misi Agent — Perintah Langsung ke Agent (P1, bertahap)
**ID:** M3_TASK_014
**Status:** Fase A & Fase B Done (5 Nov 2026); sisa budget USD & penjadwalan ulang Done (6 Nov 2026).

**Tambahan 6 Nov 2026**

*Budget USD per misi*
- **Sumber biaya:** tool MCP `intel_run_costs {workspace_id, run_ids}` menjumlahkan biaya LLM per run dari `mcp.llm_calls` (`cost_usd`, atau tarif per tier bila kosong), hanya untuk run milik workspace tsb.
- **Pengecekan:** penjadwal menyimpan `runs_cost_usd`. Bila `budget_usd` (opsional, ≤ $100) tercapai, misi `paused` (`BUDGET_REACHED`) dan pembuatnya diberi notifikasi `mission_budget_reached`.
- **Melanjutkan:** `POST /missions/:id/resume {extra_runs, extra_budget_usd}` wajib membuat budget > biaya terpakai.
- **Form & UI:** form misi dan kartu Penjadwalan menerima `budget_usd`. UI menampilkan "Biaya run $x dari budget $y" dan tombol "Tambah $1 budget & lanjutkan".

*Coba ulang run gagal*
- Run agent yang gagal diulang sekali (task dilepas → dikerjakan lagi).
- Setelah 2 kali gagal, task menunggu manusia.

*Penjadwalan ulang deterministik* (sekali sehari per misi, `last_reschedule_on`; tanpa LLM)
- **Aturan:** task `todo` yang lewat tenggat digeser ke hari ini dengan durasi tetap.
  - Dependen digeser hanya bila dependensinya benar-benar digeser; tumpang-tindih bawaan rencana dibiarkan.
  - Rentang task induk diperlebar menutup subtask.
- **Mode auto:** jadwal diterapkan + komentar di task induk; notifikasi `mission_rescheduled` bila melewati akhir timeline.
- **Mode review:** hanya komentar usulan + notifikasi.

*Migrasi & test*
- **Migrasi:** `20261106000000_m3_mission_budget`.
- **Test:**
  - Jest: `mission-reschedule.rules.spec.ts`, `mission-executor.service.spec.ts` (budget, retry, reschedule), `mission.service.spec.ts` (resume + budget).
  - MCP: `test_run_costs_sum_per_run_scoped_to_workspace`.

**Implementasi Fase B (berbeda dari rancangan bila disebut)**

*Penjadwal*
- **Mekanisme:** `MissionExecutorService.tick()` dipanggil sweeper Intel tiap **2 menit** (bukan cron 5 menit) dan langsung setelah rencana ditulis.
- **Task yang dipilih** (`mission.rules.pickRunnable`) memenuhi semua syarat berikut:
  - bertanda `eksekutor:agent`, berstatus `todo`, belum di-assign, `agent_status=idle`;
  - `start_date ≤ hari ini` (zona waktu workspace);
  - dependensinya `done` (via `task_map` ref → id yang disimpan saat materialisasi) dan semua subtask-nya `done`.
- **Batas run:** maksimal 2 run aktif per misi.

*Eksekusi*
- **Penugasan:** task di-assign ke agent `agent_key` rencana (fallback agent planner) atas nama pembuat misi, lewat `TasksService.updateAs`, sehingga run Modul 2 `assignment` berjalan. Run yang selesai menandai task `done` (perilaku Modul 2).
- **Konteks run:** sebelum dispatch, blok paragraf "Konteks misi …" (perintah, timeline, dependensi selesai) ditambahkan ke dokumen task. Brief run Modul 2 membaca blok task.

*Budget*
- **Bentuknya jumlah run, bukan USD:**
  - `max_runs` (default 10, maks 50) dan `runs_dispatched`;
  - kuota diklaim atomik sebelum dispatch;
  - token per run dibatasi `run_token_budget` profil agent dan kuota harian Gateway.
- **USD per misi belum ada:** budget USD per misi ditunda karena biaya run Modul 2 belum tercatat per misi.

*Status & aksi*
- **Status:** `scheduled` (menunggu tanggal/dependensi), `running`, `paused`, `completed`. `completed` diberikan bila semua task rencana `done`, dan task induk ikut ditandai `done`. Task induk atau project dihapus → `cancelled`.
- **Aksi:**
  - `POST /missions/:id/pause`;
  - `POST /missions/:id/resume {extra_runs}`;
  - `cancel` sekarang juga menghentikan run aktif (`AgentRunsService.cancelActive`).
- **Detail misi:** menyertakan `progress` (task total/selesai, task agent selesai/berjalan/gagal).

*Pengaturan & kendala*
- **Opt-in/out:** form misi dan kartu Penjadwalan wizard punya pilihan **"Agent mengerjakan task bagiannya"** (default aktif). Form misi juga punya kuota run.
- **Re-plan otomatis saat terlambat/gagal:** belum. Task gagal ditandai `agent_status=failed` + komentar sistem dari Modul 2, dan menunggu tindakan manusia.
- **MCP:** planner hanya boleh menugasi agent yang profilnya aktif di MCP (mis. bukan `assistant`). Bila output LLM tidak valid, planner diminta ulang sekali dengan alasan penolakan, dan rentang task induk diperlebar agar mencakup subtask.

*Test & verifikasi*
- **Tes otomatis:**
  - Jest: `mission-execution.rules.spec.ts`, `mission-executor.service.spec.ts`, `mission.service.spec.ts`.
  - MCP: unit + integrasi.
- **Uji nyata:** misi 1 run, task dikerjakan Agent_Strategist dalam ±40 detik, hasil tertulis di dokumen task, misi `completed`.
- **Playwright stack:** 9/9. E2E mematikan eksekusi agar suite tidak memicu run berbayar.

**Implementasi Fase A**
- **Backend:**
  - `POST /workspaces/:ws/missions` (member) → `IntelService.createMission` → `MissionService.createManualInTx`: project AI baru bila tanpa `project_id`, task induk "Misi: …", misi `source=manual`. Planning berjalan di latar memakai `intel_mission_plan`.
  - `GET /workspaces/:ws/missions` (viewer).
  - Approve/revisi/batal/coba lagi memakai ulang TASK_013.
- **Frontend:**
  - Halaman **Misi Agent** (`/intel/missions`, tombol di header Riset & Insight) dan form dialog **Perintah ke Agent** (judul, perintah, hasil yang diharapkan, project, timeline, mode).
  - Halaman detail misi (`/intel/missions/:id`) dengan panel tinjauan yang sama dengan detail job.
- **Test:** Jest `mission.service.spec.ts`, Vitest form, Playwright E2E-M3-10 (stack nyata, 9/9 suite lulus).

**Ditunda ke Fase B:** pemilih agent planner di form dan budget USD (YAGNI sebelum ada eksekusi). Estimasi biaya ditampilkan statis (±$0,03–0,05 per perintah).
**Repo:** `marketingdashboardjtp` + `mcp`
**Dependencies:** [M3_TASK_013](M3_TASK_013_AGENT_PLANNER.md) (misi + planner + materialisasi), Modul 2 (agent run `assignment`, runtime agent MCP, budget)
**Estimasi:** Fase A 3 pd + Fase B 5 pd

## Objective
User cukup memberi **perintah**, **tujuan**, dan **timeline**. Agent lalu:
1. Menyusun jadwal: task dan subtask bertanggal, dengan agent sendiri yang menentukan strukturnya.
2. Menulisnya ke Penjadwalan.
3. **Mengerjakan** task bagiannya memakai tool yang diizinkan, sambil memperbarui progres di setiap langkah.

Default **langsung jalan**. Opsi **tinjau dulu** tersedia, sama seperti TASK_013.

## Fase
| Fase | Isi | Tingkat |
|---|---|---|
| **A** | Form misi → planner (TASK_013) → materialisasi → pemantauan | (a) Rencana + update otomatis |
| **B** | Eksekusi: task `executor=agent` dijalankan agent sesuai jadwal lewat run Modul 2, progres/hasil ditulis otomatis | (b) Agentic dengan batas |

## Form "Perintah ke Agent" (Riset & Insight → tab **Misi**)
| Field | Aturan |
|---|---|
| Judul | 1–150 |
| Perintah | 10–4000 karakter, mis. "Siapkan kampanye peluncuran produk X di Instagram & X" |
| Hasil yang diharapkan | ≤ 1000, opsional |
| Project | Wajib, project di workspace aktif (atau "Buat project baru") |
| Timeline | Mulai–selesai, ≤ 180 hari |
| Agent planner | Default `strategist`; agent aktif dengan toolset `task` |
| Mode | **Langsung jalan** (default) / **Tinjau dulu** |
| Eksekusi oleh agent | Default aktif (Fase B); bila nonaktif, agent hanya menyusun dan memantau |
| Budget maksimal | USD, default 1,00, maksimal 20 |

## Fase A — backend & MCP
- [ ] `POST /workspaces/:ws/missions` (member):
  - Membuat misi `source=manual` + task induk.
  - Lalu memanggil `mission_plan` dengan `context` = brief project + task yang sudah ada + `kb_search` (bila ada).
- [ ] **Estimasi biaya** planning sebelum submit (`POST /workspaces/:ws/missions/estimate`).
- [ ] **Event misi** diteruskan ke Socket.IO `mission.updated` (room workspace, throttle 1/s).
- [ ] **Pemakaian ulang dari TASK_013:** approve / revise / cancel, materialisasi, dan validasi rencana.

## Fase B — eksekusi
- [ ] **Penjadwal (Dashboard, cron 5 menit):**
  - Task misi berstatus `todo`, `executor=agent`, `start_date ≤ hari ini`, dan semua dependensinya `done` → di-assign ke agent (`assignee_agent_id`) → run Modul 2 `assignment`.
  - Paralel maksimal **2 run per misi**.
- [ ] **Brief run** menyertakan:
  - Perintah dan tujuan misi.
  - Ringkasan rencana.
  - Hasil task dependensi (blok dokumen task).
  - Batas waktu task.
- [ ] **Batas (guardrail):**
  - Langkah maksimal per run = `max_steps` profil (default 25).
  - Budget misi dicek sebelum setiap dispatch dari `cost_usd` (usage Gateway per `caller_task`). Bila terlampaui:
    - Misi dijeda (`status=paused`).
    - Notifikasi dikirim.
    - Tidak ada run baru.
  - Tool mengikuti toolset profil agent (mis. `web`, `social`, `kb`, `analysis`, `task`).
  - Tulisan hanya di bawah task induk misi, ditegakkan oleh `_ensure_run_task`.
  - Agent tidak boleh mengubah assignee (aturan `mcp-api` yang ada).
- [ ] **Progres:**
  - Memakai event run Modul 2: `agent_status`, subtask, komentar, blok hasil.
  - Task selesai → `done`.
  - Run gagal 2× → task `in_progress` + `agent_status=failed` + komentar. Misi tetap berjalan untuk task lain.
- [ ] **Re-plan:**
  - Bila task terlambat > 1 hari atau gagal, planner mengusulkan penjadwalan ulang (`task_reschedule` cascade) untuk sisa task.
  - Mode `auto` langsung menerapkan usulan itu. Mode `review` meminta persetujuan.
- [ ] **Selesai:** semua task `done` (atau dibatalkan) → misi `completed`. Agent menulis ringkasan hasil di task induk.

## Frontend
- [ ] Tab **Misi** di Riset & Insight berisi daftar misi (status, progres %, biaya vs budget, tenggat) + tombol **Perintah ke Agent**.
- [ ] Detail misi:
  - Rencana (pohon task + tanggal + risiko).
  - Linimasa run.
  - Biaya.
  - Log event.
  - Tombol **Jeda / Lanjutkan / Batalkan**, plus **Setujui / Revisi** bila menunggu tinjauan.
- [ ] Tautan dua arah: task induk di Penjadwalan ↔ detail misi.

## Acceptance Criteria
1. **Fase A:** submit form dalam mode auto menghasilkan task dan subtask di Penjadwalan dalam timeline. Mode review baru menulis setelah disetujui.
2. **Fase B:** task `executor=agent` yang jatuh tempo dikerjakan otomatis. Status, komentar, dan hasil muncul real-time di Penjadwalan.
3. **Budget habis** → misi dijeda tanpa run baru, dan user mendapat notifikasi.
4. **Batas wewenang:** agent tidak dapat menulis task di luar task induk misi, dibuktikan dengan test integrasi MCP.
5. **Batalkan misi** menghentikan run aktif (`pm_cancel_agent_run`), sementara task yang sudah dibuat tetap ada.
