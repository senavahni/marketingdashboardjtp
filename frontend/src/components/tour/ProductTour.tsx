import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { useProjects } from '../../hooks/queries';
import { useTour } from '../../lib/tour-store';
import { cn } from '../../lib/utils';
import { Button, IconButton } from '../ui/button';

type Page = 'home' | 'brief' | 'table' | 'board' | 'timeline';

interface TourStep {
  /** Nilai atribut `data-tour` elemen yang disorot; kosong = kartu di tengah layar. */
  target?: string;
  /** Halaman yang dibuka sebelum langkah ditampilkan (view proyek memakai proyek aktif / pertama). */
  page?: Page;
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
        Tutorial ini memandu Anda fitur demi fitur: workspace, proyek, empat tampilan task, dokumen brief, sampai mendelegasikan pekerjaan ke AI Agent.
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
  const projectId = location.pathname.match(/\/p\/([^/]+)/)?.[1] ?? projects?.[0]?.id;
  // Tanpa proyek, langkah-langkah halaman proyek dilewati.
  const steps = useMemo(() => STEPS.filter((s) => !s.page || s.page === 'home' || projectId), [projectId]);
  const index = Math.min(step, steps.length - 1);
  const current = steps[index];
  const isLast = index === steps.length - 1;
  const layout = useTargetLayout(current?.target, open);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);

  useEffect(() => {
    if (!open || !current?.page) return;
    const dest = current.page === 'home' ? `/w/${workspaceId}` : `/w/${workspaceId}/p/${projectId}?view=${current.page}`;
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
