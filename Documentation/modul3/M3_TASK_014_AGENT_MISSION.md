# Task: Misi Agent — Perintah Langsung ke Agent (P1, bertahap)
**ID:** M3_TASK_014
**Status:** Belum dimulai (dokumen disusun 5 Nov 2026)
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
