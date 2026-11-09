import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { useIntelEnabled } from '../../hooks/intel-queries';
import { useProjects } from '../../hooks/queries';
import { useTour } from '../../lib/tour-store';
import { cn } from '../../lib/utils';
import { Button, IconButton } from '../ui/button';

type Page = 'home' | 'brief' | 'table' | 'board' | 'timeline' | 'web-report' | 'intel' | 'intel-sources' | 'intel-missions';
const PROJECT_PAGES: Page[] = ['brief', 'table', 'board', 'timeline'];

interface TourStep {
  /** Nilai atribut `data-tour` elemen yang disorot; kosong = kartu di tengah layar. */
  target?: string;
  /** Halaman yang dibuka sebelum langkah ditampilkan (view proyek memakai proyek aktif / pertama). */
  page?: Page;
  /** Langkah khusus Modul 3: dilewati bila modul Intel belum diaktifkan. */
  intel?: boolean;
  title: string;
  body: ReactNode;
}

const K = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line-strong bg-sidebar px-1 font-mono text-[11px] text-ink">{children}</kbd>
);

const STEPS: TourStep[] = [
  {
    title: 'Selamat datang di Marketing Dashboard 👋',
    body: (
      <>
        Tutorial ini memandu Anda fitur demi fitur: workspace, proyek, empat tampilan task, dokumen brief, mendelegasikan pekerjaan ke AI Agent, Laporan
        Performa Website, sampai Riset & Insight.
        Gunakan tombol <b>Lanjut</b> atau <K>←</K> <K>→</K>; tekan <K>Esc</K> untuk keluar.
      </>
    ),
  },
  {
    target: 'workspace',
    page: 'home',
    title: 'Workspace',
    body: 'Klik nama workspace untuk berpindah workspace, membuat workspace baru, atau keluar dari akun. Setiap workspace punya anggota, proyek, dan AI Agent sendiri.',
  },
  {
    target: 'nav-home',
    page: 'home',
    title: 'Beranda',
    body: 'Ringkasan semua proyek di workspace ini, lengkap dengan jumlah task dan kapan terakhir diubah.',
  },
  {
    target: 'inbox',
    title: 'Inbox',
    body: 'Notifikasi untuk Anda: di-mention, di-assign task, komentar baru, atau AI Agent selesai bekerja. Angka merah = belum dibaca. Klik notifikasi untuk langsung membuka task terkait.',
  },
  {
    target: 'settings',
    title: 'Pengaturan',
    body: 'Kelola anggota tim beserta perannya (Owner, Admin, Member, Viewer) dan AI Agent di workspace. Viewer hanya bisa membaca.',
  },
  {
    target: 'projects',
    title: 'Daftar proyek',
    body: (
      <>
        Klik proyek untuk membukanya, <b>+ Proyek baru</b> untuk membuat proyek. Arahkan kursor ke proyek lalu klik <b>⋯</b> untuk menghapusnya.
      </>
    ),
  },
  {
    target: 'agents',
    title: 'AI Agents',
    body: 'AI Agent adalah anggota tim virtual. Mereka bisa di-assign task atau di-mention seperti rekan kerja biasa. Agent yang nonaktif tampil pudar.',
  },
  {
    target: 'project-header',
    page: 'table',
    title: 'Halaman proyek',
    body: 'Sekarang kita buka sebuah proyek. Klik ikon untuk mengganti emoji, klik judul untuk mengganti nama proyek. Semua perubahan tersimpan otomatis.',
  },
  {
    target: 'views',
    page: 'table',
    title: 'Empat tampilan',
    body: (
      <>
        Data task yang sama bisa dilihat sebagai <b>Brief</b> (dokumen), <b>Tabel</b>, <b>Board</b> (kanban), dan <b>Timeline</b> (jadwal). Kita lihat satu per satu.
      </>
    ),
  },
  {
    target: 'view-content',
    page: 'brief',
    title: 'Brief: dokumen proyek',
    body: (
      <>
        Tulis brief kampanye di sini. Dokumen ini konteks utama yang dibaca AI Agent. Ketik <K>/</K> untuk memilih blok (heading, checklist, toggle, tabel, kode,
        gambar, embed) dan <K>@</K> untuk mention orang atau agent. Di bagian bawah ada <b>Diskusi</b> dan <b>Aktivitas proyek</b>.
      </>
    ),
  },
  {
    target: 'view-content',
    page: 'table',
    title: 'Tabel',
    body: (
      <>
        Klik judul task untuk membukanya di <b>side peek</b> (panel kanan; <K>Esc</K> menutup, ⤢ membuka halaman penuh). Klik sel Status, Assignee, Tanggal,
        Prioritas, atau Tag untuk mengubahnya langsung. Task yang punya subtask bisa di-expand, dan lebar kolom bisa ditarik. Arahkan kursor ke baris lalu
        klik <b>SALIN</b> untuk menduplikasi task beserta subtask & timeline-nya.
      </>
    ),
  },
  {
    target: 'toolbar',
    page: 'table',
    title: 'Cari, filter & buat task',
    body: (
      <>
        Cari task berdasarkan judul, tampilkan hanya task <b>Milik saya</b>, atau klik <b>Baru</b> untuk membuat task dan langsung membukanya.
      </>
    ),
  },
  {
    target: 'view-content',
    page: 'board',
    title: 'Board',
    body: 'Task dikelompokkan per status seperti papan kanban. Seret kartu ke kolom lain untuk mengubah statusnya.',
  },
  {
    target: 'view-content',
    page: 'timeline',
    title: 'Timeline',
    body: (
      <>
        Jadwal task dalam bentuk gantt. Geser bar untuk memindah tanggal, tarik tepinya untuk mengubah durasi, atau fokuskan bar lalu pakai <K>←</K> <K>→</K>.
        Gunakan <b>Hari ini</b> untuk melompat ke tanggal sekarang dan <b>Hari / Minggu</b> untuk mengganti skala.
      </>
    ),
  },
  {
    target: 'view-content',
    page: 'table',
    title: 'Delegasi ke AI Agent 🤖',
    body: (
      <>
        Buka sebuah task, lalu pilih agent di <b>Assignee</b> (bagian <i>AI Agents</i>), atau mention <K>@NamaAgent</K> di komentar. Agent mengerjakan task dan
        melaporkan hasilnya di task tersebut. Fitur ini butuh MCP Server; tanpa itu task agent berstatus <b>Gagal</b> dan bisa di-<b>Coba lagi</b>.
      </>
    ),
  },
  // ----- Modul 2: Laporan Performa Website
  {
    target: 'nav-web-report',
    page: 'web-report',
    title: 'Laporan Performa Website 📊',
    body: 'Menu ini mengubah data satu periode (pengunjung, leads, sales, omset, biaya) menjadi laporan konversi & finansial yang siap dipresentasikan.',
  },
  {
    target: 'wr-new',
    page: 'web-report',
    title: 'Buat laporan',
    body: (
      <>
        Klik <b>Laporan Baru</b>, pilih jenis periode (bulanan, kuartal, tahunan, atau custom), lalu isi angka. Hasil seperti <b>Lead CR</b>, <b>ROAS</b>, dan{' '}
        <b>AOV</b> dihitung otomatis lengkap dengan insight.
      </>
    ),
  },
  {
    target: 'wr-toolbar',
    page: 'web-report',
    title: 'Filter & bandingkan',
    body: (
      <>
        Saring laporan per jenis periode atau tahun. Centang 2–12 laporan di tabel, lalu klik <b>Bandingkan</b> untuk melihat tren antar-periode dalam satu grafik.
      </>
    ),
  },
  {
    target: 'wr-list',
    page: 'web-report',
    title: 'Hasil & ekspor',
    body: (
      <>
        Klik baris laporan untuk membuka hasilnya: funnel, omset vs biaya, metrik, dan insight. Dari sana laporan bisa diekspor ke <b>PDF</b>, <b>PPTX</b>, <b>XLSX</b>{' '}
        (dengan rumus), atau <b>CSV</b>. Menu <b>⋯</b> di ujung baris untuk mengubah atau menghapus.
      </>
    ),
  },
  // ----- Modul 3: Riset & Insight
  {
    target: 'nav-intel',
    page: 'intel',
    intel: true,
    title: 'Riset & Insight 🛰️',
    body: 'Kumpulkan percakapan dari X, Threads, halaman web, dan Google Trends, lalu biarkan AI Agent merangkum sentimen, tren, dan rekomendasinya.',
  },
  {
    target: 'intel-new',
    page: 'intel',
    intel: true,
    title: 'Job riset baru',
    body: (
      <>
        Wizard 4 langkah: <b>Sumber & target</b> (keyword, URL) → <b>Waktu & batas</b> → <b>Agent</b> per tahap → <b>Estimasi</b> biaya & durasi. Tidak ada yang
        dijalankan sebelum Anda melihat estimasinya; job mahal meminta konfirmasi.
      </>
    ),
  },
  {
    target: 'intel-filters',
    page: 'intel',
    intel: true,
    title: 'Pantau job',
    body: (
      <>
        Daftar job memperbarui status & progres secara <b>real-time</b> — tidak perlu refresh. Saring per status atau sumber; kolom Biaya menampilkan aktual di
        samping estimasi.
      </>
    ),
  },
  {
    page: 'intel',
    intel: true,
    title: 'Detail job & laporan',
    body: (
      <>
        Buka sebuah job untuk melihat <b>timeline tahap</b> (agent Kumpulkan → Analisis, progres, durasi, biaya). Tab <b>Ringkasan</b> berisi sentimen, tren,
        rekomendasi & grafik; <b>Data mentah</b> bisa dicari, difilter, dan diekspor CSV; <b>Log</b> mencatat event dari MCP. Laporan bisa diekspor ke PDF/XLSX,
        dan job bisa <b>Dibatalkan</b> atau <b>Diulangi</b>.
      </>
    ),
  },
  {
    target: 'intel-sources',
    page: 'intel',
    intel: true,
    title: 'Sumber & Koneksi',
    body: 'Cek mode tiap sumber (API resmi, mode browser, atau tidak tersedia) dan status route LLM sebelum menjalankan riset.',
  },
  {
    target: 'intel-missions',
    page: 'intel',
    intel: true,
    title: 'Misi Agent: tugas terjadwal 🗓️',
    body: (
      <>
        Ingin agent mengerjakan pekerjaan sesuai jadwal? Buka <b>Misi Agent</b>. Cukup beri perintah dan timeline; agent menyusun task & subtask bertanggal di
        Penjadwalan, lalu mengerjakan bagiannya sendiri saat tanggalnya tiba.
      </>
    ),
  },
  {
    target: 'mission-new',
    page: 'intel-missions',
    intel: true,
    title: 'Beri perintah ke agent',
    body: (
      <>
        Klik <b>Perintah ke Agent</b>, isi judul, perintah, hasil yang diharapkan, proyek, dan timeline. Pilih <b>Langsung jalan</b> (rencana langsung ditulis)
        atau <b>Tinjau dulu</b> (rencana disetujui dulu). Biarkan <b>Agent mengerjakan task bagiannya</b> aktif, lalu atur kuota run dan budget USD (opsional).
      </>
    ),
  },
  {
    target: 'mission-list',
    page: 'intel-missions',
    intel: true,
    title: 'Agent bekerja sesuai jadwal',
    body: (
      <>
        Tiap ±2 menit, task berlabel <b>eksekutor:agent</b> yang tanggal mulainya sudah tiba dan dependensinya selesai otomatis dikerjakan (maks. 2 run
        sekaligus). Run gagal dicoba ulang sekali, task terlambat digeser sekali sehari. Buka misi untuk melihat progres dan biaya, lalu <b>Jeda</b>,{' '}
        <b>Lanjutkan</b>, atau <b>Batalkan</b>. Misi otomatis dijeda bila kuota run atau budget habis.
      </>
    ),
  },
  {
    target: 'settings',
    page: 'intel',
    intel: true,
    title: 'Agent & LLM Gateway',
    body: (
      <>
        Di <b>Pengaturan → AI Agents</b> terlihat kapabilitas tiap agent (Kumpulkan/Analisis/Indeks). Admin bisa mengatur <b>default agent per tahap</b> dan memantau
        key & pemakaian LLM per agent di <b>Pengaturan → AI & Gateway</b>.
      </>
    ),
  },
  {
    target: 'tutorial',
    title: 'Selesai! 🎉',
    body: (
      <>
        Anda bisa membuka tutorial ini lagi kapan saja lewat tombol <b>Tutorial</b> di sidebar.
      </>
    ),
  },
];

function tourDestination(page: Page, workspaceId: string, projectId: string | undefined): string {
  if (page === 'home') return `/w/${workspaceId}`;
  if (page === 'web-report') return `/w/${workspaceId}/web-report`;
  if (page === 'intel') return `/w/${workspaceId}/intel`;
  if (page === 'intel-sources') return `/w/${workspaceId}/intel/sources`;
  if (page === 'intel-missions') return `/w/${workspaceId}/intel/missions`;
  return `/w/${workspaceId}/p/${projectId}?view=${page}`;
}

const CARD_W = 340;
const GAP = 12;
const PAD = 6;
const MARGIN = 16;

interface Layout {
  rect: DOMRect | null;
  vw: number;
  vh: number;
}

/** Mengukur posisi elemen target terus-menerus (target bisa baru muncul setelah navigasi / data dimuat). */
function useTargetLayout(target: string | undefined, active: boolean): Layout {
  const [layout, setLayout] = useState<Layout>({ rect: null, vw: window.innerWidth, vh: window.innerHeight });
  useLayoutEffect(() => {
    if (!active) return;
    let prev = '';
    let scrolled = false;
    const measure = () => {
      const el = target ? document.querySelector(`[data-tour="${target}"]`) : null;
      if (el && !scrolled) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        scrolled = true;
      }
      const r = el?.getBoundingClientRect();
      const rect = r && r.width > 0 && r.height > 0 ? r : null;
      const key = `${rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : '-'}|${window.innerWidth}x${window.innerHeight}`;
      if (key === prev) return;
      prev = key;
      setLayout({ rect, vw: window.innerWidth, vh: window.innerHeight });
    };
    measure();
    const id = window.setInterval(measure, 150);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [target, active]);
  return layout;
}

/** Posisi kartu: kanan target → bawah → atas → kiri; jika target terlalu besar, kartu di pojok kanan bawah. */
function placeCard({ rect: r, vw, vh }: Layout, h: number): { left: number; top: number } {
  const clampTop = (t: number) => Math.min(Math.max(MARGIN, t), vh - h - MARGIN);
  const clampLeft = (l: number) => Math.min(Math.max(MARGIN, l), vw - CARD_W - MARGIN);
  if (!r) return { left: clampLeft((vw - CARD_W) / 2), top: clampTop((vh - h) / 2) };
  if (r.right + GAP + CARD_W <= vw - MARGIN) return { left: r.right + GAP, top: clampTop(r.top) };
  if (r.bottom + GAP + h <= vh - MARGIN) return { left: clampLeft(r.left), top: r.bottom + GAP };
  if (r.top - GAP - h >= MARGIN) return { left: clampLeft(r.left), top: r.top - GAP - h };
  if (r.left - GAP - CARD_W >= MARGIN) return { left: r.left - GAP - CARD_W, top: clampTop(r.top) };
  return { left: vw - CARD_W - MARGIN * 2, top: vh - h - MARGIN * 2 };
}

/** Tutorial penggunaan: menyorot fitur satu per satu dan berpindah halaman bila perlu. */
export function ProductTour({ workspaceId }: { workspaceId: string }) {
  const { open, step, go, stop } = useTour();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: projects } = useProjects(workspaceId);
  const intelEnabled = useIntelEnabled(workspaceId);
  const projectId = location.pathname.match(/\/p\/([^/]+)/)?.[1] ?? projects?.[0]?.id;
  // Tanpa proyek, langkah halaman proyek dilewati; tanpa modul Intel, langkah Riset & Insight dilewati.
  const steps = useMemo(
    () => STEPS.filter((s) => (!s.page || !PROJECT_PAGES.includes(s.page) || projectId) && (!s.intel || intelEnabled)),
    [projectId, intelEnabled],
  );
  const index = Math.min(step, steps.length - 1);
  const current = steps[index];
  const isLast = index === steps.length - 1;
  const layout = useTargetLayout(current?.target, open);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);

  useEffect(() => {
    if (!open || !current?.page) return;
    const dest = tourDestination(current.page, workspaceId, projectId);
    if (location.pathname + location.search !== dest) navigate(dest);
  }, [open, current, workspaceId, projectId, location.pathname, location.search, navigate]);

  useLayoutEffect(() => {
    if (open && cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [open, index, layout]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
      else if (e.key === 'ArrowRight') isLast ? stop() : go(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) go(index - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, index, isLast, go, stop]);

  if (!open || !current) return null;

  const { rect, vw, vh } = layout;
  const pos = placeCard(layout, cardH);
  const spot = rect && {
    left: Math.max(rect.left - PAD, 4),
    top: Math.max(rect.top - PAD, 4),
    right: Math.min(rect.right + PAD, vw - 4),
    bottom: Math.min(rect.bottom + PAD, vh - 4),
  };

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {spot ? (
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-accent transition-all duration-200"
          style={{ left: spot.left, top: spot.top, width: spot.right - spot.left, height: spot.bottom - spot.top, boxShadow: '0 0 0 9999px rgba(15,15,15,0.5)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(15,15,15,0.5)]" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="fixed rounded-xl border border-line bg-white p-4 shadow-[0_12px_40px_rgba(15,15,15,0.2)] transition-[left,top] duration-200"
        style={{ width: CARD_W, left: pos.left, top: pos.top }}
      >
        <div className="mb-1 flex items-start gap-2">
          <h2 id="tour-title" className="flex-1 text-[15px] font-semibold">
            {current.title}
          </h2>
          <IconButton label="Tutup tutorial" onClick={stop}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="text-[13px] leading-relaxed text-ink-soft">{current.body}</div>
        <div className="mt-4 flex items-center gap-1">
          <div className="mr-auto flex gap-1" aria-label={`Langkah ${index + 1} dari ${steps.length}`}>
            {steps.map((_, i) => (
              <span key={i} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-accent' : 'w-1.5 bg-line-strong')} />
            ))}
          </div>
          {index > 0 && (
            <Button size="sm" variant="outline" onClick={() => go(index - 1)}>
              Kembali
            </Button>
          )}
          <Button key={index} size="sm" variant="primary" autoFocus onClick={() => (isLast ? stop() : go(index + 1))}>
            {isLast ? 'Selesai' : index === 0 ? 'Mulai' : 'Lanjut'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
