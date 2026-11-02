# Task: Frontend — Menu, Daftar Sesi & Form Input Manual
**ID:** M2_TASK_002
**Status:** To Do
**Dependencies:** M2_TASK_001 (API)
**Estimasi:** 2 person-days (Frontend)
**Acuan:** [PRD §5](M2_PRD.md#5-input-manual-per-sesi), [UC-M2-01, 02, 04](M2_USE_CASES.md)

## Objective
Menyediakan pintu masuk modul (sidebar + route), halaman daftar sesi, serta form input manual untuk membuat/mengubah sesi. Setelah simpan, user langsung diarahkan ke modal hasil (TASK_003).

## A. Routing & Navigasi
- [ ] Route baru di `frontend/src/main.tsx`, di bawah `/w/:workspaceId`: `{ path: 'web-report', element: <WebReportPage /> }`.
- [ ] Item sidebar **"Laporan Website"** (ikon `lucide-react` `ChartNoAxesCombined` atau `TrendingUp`) di `components/layout/Sidebar.tsx`, di atas daftar project.
- [ ] Query param `?session=<id>` membuka modal hasil (P1, FR-12). Menutup modal menghapus param.

## B. Halaman Daftar Sesi (`pages/WebReportPage.tsx`)
- [ ] Header: judul "Laporan Performa Website", deskripsi singkat 1 baris, tombol **"+ Laporan Baru"** (disembunyikan untuk Viewer).
- [ ] Filter sederhana: jenis periode (Semua/Bulanan/Kuartalan/Tahunan/Kustom) dan tahun.
- [ ] Tabel kolom: Judul · Periode (format `Okt 2026`, `Q4 2026`, `2026`, atau `1 Okt – 15 Nov 2026`) · Pengunjung · Sales · Omset · ROAS · Diperbarui (relatif + nama). Angka rata kanan, format `id-ID`.
- [ ] Klik baris → buka modal hasil. Menu ⋯ per baris: Lihat, Ubah, Hapus (sesuai hak, [PRD §3](M2_PRD.md#3-persona--hak-akses)).
- [ ] Checkbox per baris + tombol **"Bandingkan (n)"** aktif jika 2–12 dipilih (P1, TASK_003 §D).
- [ ] Pagination cursor "Muat lebih banyak" (pola Modul 1).
- [ ] State: loading skeleton, empty state ("Belum ada laporan. Buat laporan pertama dari data website periode ini." + tombol), error state + tombol coba lagi.

## C. Form Input (`components/web-report/WebReportFormDialog.tsx`)
Dialog Radix (`components/ui/dialog.tsx`), dipakai untuk **buat** dan **ubah**.

Susunan form (3 kelompok, label jelas, helper text singkat):
1. **Periode:** Judul · Jenis periode (segmented) · pemilih Bulan / Kuartal / Tahun / rentang tanggal kustom. Untuk non-kustom, `period_start`/`period_end` dihitung otomatis. Judul otomatis disarankan ("Website — Oktober 2026") selama user belum mengubahnya.
2. **Funnel:** Total pengunjung · Total order masuk (leads) · Total sales (closing/lunas).
3. **Nominal:** Total omset · Biaya maintenance website · Biaya iklan (default 0). Ditambah Catatan (opsional, textarea).

- [ ] Input angka memakai komponen `NumberInput` dengan format ribuan `id-ID` saat diketik (`20.000`), prefix `Rp` untuk nominal, `inputMode="numeric"`/`"decimal"`. Nilai yang dikirim ke API adalah angka/desimal mentah.
- [ ] Validasi Zod di client (mirror aturan TASK_001 C): per field, real-time setelah *blur*. Pesan Bahasa Indonesia, mis. "Sales tidak boleh melebihi jumlah leads".
- [ ] Ringkasan kecil di bawah form ("Total biaya: Rp15.000.000") — **bukan** perhitungan metrik (metrik hanya dari backend, README D3).
- [ ] Tombol **"Hitung & Simpan"** (primary) dan "Batal". Loading saat submit; data form tidak hilang jika gagal.
- [ ] Error API dipetakan ke field (`details.field`) atau toast. 409 `VERSION_CONFLICT` → banner "Laporan sudah diubah orang lain" + tombol "Muat ulang".
- [ ] Sukses: tutup dialog, invalidate query list, buka modal hasil sesi tersebut.

## D. Hapus
- [ ] Dialog konfirmasi dengan judul sesi → `DELETE` → toast "Laporan dihapus", invalidate list, tutup modal jika terbuka.

## E. Data Layer
- [ ] `lib/web-report-api.ts`: fungsi typed untuk endpoint TASK_001 memakai klien `lib/api.ts`.
- [ ] Hook TanStack Query: `useWebReports(filters)`, `useWebReport(id)`, `useCreateWebReport`, `useUpdateWebReport`, `useDeleteWebReport`, `useCompareWebReports(ids)`.
- [ ] Tipe `WebReportSession`, `WebReportResults`, `Insight` di `lib/types.ts` (atau `lib/web-report-types.ts`).
- [ ] Util format di `lib/web-report-format.ts`: `formatRupiah`, `formatRupiahShort`, `formatPercent` (presisi adaptif [PRD §6.4](M2_PRD.md#64-presisi--format-tampilan)), `formatRoas`, `formatPeriod`, `formatNullable`. Dipakai ulang oleh TASK_003 & TASK_004.

## Acceptance Criteria
1. Menu terlihat di semua workspace; route bisa di-refresh langsung.
2. UC-M2-01 langkah 1–6 berjalan: setelah "Hitung & Simpan", sesi muncul di daftar dan modal hasil terbuka.
3. Semua aturan validasi PRD §5 ditolak di client dengan pesan per field; data tidak hilang saat API error.
4. Viewer tidak melihat tombol buat/ubah/hapus; Member tidak melihat ubah/hapus pada sesi milik orang lain.
5. `formatPercent(0.0058) === "0,0058%"`, `formatPercent(0.3188) === "0,32%"`, `formatRupiah("56380950.00") === "Rp56.380.950"` (unit test).
6. Bisa dioperasikan penuh dengan keyboard; label terhubung ke input; fokus kembali ke pemicu saat dialog ditutup.
