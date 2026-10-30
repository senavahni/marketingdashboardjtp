import * as argon2 from 'argon2';
import { actor_type, Prisma, task_priority, task_status } from '../../generated/prisma/client';
import { extractPlainText, validateBlockContent } from '../../shared/schemas/block.schema';
import { SEED_IDS } from './seed-ids';
import { assertNotProduction, createScriptClient } from './seed-client';

/**
 * Data dummy untuk demo: 3 user tambahan + 3 project marketing lengkap (task, subtask, milestone,
 * timeline relatif terhadap hari ini, brief, komentar & balasan, riwayat aktivitas).
 * Idempotent (ID deterministik). Jalankan setelah db:seed: npm run db:seed:dummy
 */

/** ID deterministik; blok ke-4 berawalan 9 agar tidak bentrok dengan SEED_IDS (8000). */
const id = (group: number, n: number) => `00000000-0000-4000-9${String(group).padStart(3, '0')}-${String(n).padStart(12, '0')}`;

const DAY = 86_400_000;
const now = new Date();
const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const day = (offset: number) => new Date(today + offset * DAY);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
/** Selisih hari dari hari ini ke tanggal (bulan, tgl) berikutnya. */
const untilNext = (month: number, date: number) => {
  let t = Date.UTC(now.getUTCFullYear(), month - 1, date);
  if (t < today) t = Date.UTC(now.getUTCFullYear() + 1, month - 1, date);
  return Math.round((t - today) / DAY);
};

const NEW_USERS = [
  { key: 'andi', id: id(1, 1), email: 'andi@demo.local', username: 'andi_pratama', name: 'Andi Pratama' },
  { key: 'sari', id: id(1, 2), email: 'sari@demo.local', username: 'sari_wulandari', name: 'Sari Wulandari' },
  { key: 'budi', id: id(1, 3), email: 'budi@demo.local', username: 'budi_santoso', name: 'Budi Santoso' },
] as const;

type ActorKey = 'owner' | 'manager' | 'member' | 'andi' | 'sari' | 'budi' | 'strategist' | 'researcher';

const ACTORS: Record<ActorKey, { type: actor_type; id: string; name: string }> = {
  owner: { type: 'user', id: SEED_IDS.owner, name: 'Owner Demo' },
  manager: { type: 'user', id: SEED_IDS.manager, name: 'Manager Demo' },
  member: { type: 'user', id: SEED_IDS.member, name: 'Member Demo' },
  andi: { type: 'user', id: NEW_USERS[0].id, name: NEW_USERS[0].name },
  sari: { type: 'user', id: NEW_USERS[1].id, name: NEW_USERS[1].name },
  budi: { type: 'user', id: NEW_USERS[2].id, name: NEW_USERS[2].name },
  strategist: { type: 'agent', id: SEED_IDS.strategist, name: 'Agent_Strategist' },
  researcher: { type: 'agent', id: SEED_IDS.researcher, name: 'Agent_Researcher' },
};

interface CommentSeed {
  by: ActorKey;
  text: string;
  ago: number; // jam yang lalu
  mentions?: ActorKey[];
  replies?: CommentSeed[];
}

interface TaskSeed {
  title: string;
  status?: task_status;
  priority?: task_priority;
  assignee?: ActorKey;
  start: number; // offset hari dari hari ini
  days?: number; // durasi (default 1)
  tags?: string[];
  milestone?: boolean;
  comments?: CommentSeed[];
  subtasks?: TaskSeed[];
}

type BriefBlock = [type: 'heading' | 'paragraph' | 'bulletListItem' | 'checkListItem', text: string, props?: Record<string, unknown>];

interface ProjectSeed {
  title: string;
  icon: string;
  description: string;
  createdAgo: number; // hari yang lalu
  brief: BriefBlock[];
  comments: CommentSeed[];
  tasks: TaskSeed[];
}

const harbolnas = untilNext(12, 12);

const PROJECTS: ProjectSeed[] = [
  {
    title: 'Kampanye Harbolnas 12.12',
    icon: '🛍️',
    description: 'Kampanye promo Hari Belanja Online Nasional di website & marketplace.',
    createdAgo: 12,
    brief: [
      ['heading', 'Brief Kampanye Harbolnas 12.12', { level: 1 }],
      ['paragraph', 'Tujuan: menaikkan penjualan online 40% dibanding Harbolnas tahun lalu dan menambah 5.000 pelanggan baru.'],
      ['heading', 'Target audiens', { level: 2 }],
      ['bulletListItem', 'Pembeli marketplace usia 20–35 tahun yang sensitif terhadap promo'],
      ['bulletListItem', 'Pelanggan lama yang tidak bertransaksi dalam 6 bulan terakhir'],
      ['heading', 'KPI', { level: 2 }],
      ['checkListItem', 'GMV naik 40% YoY', { checked: false }],
      ['checkListItem', 'ROAS iklan minimal 4x', { checked: false }],
      ['checkListItem', 'Riset kompetitor selesai', { checked: true }],
    ],
    comments: [
      { by: 'owner', ago: 240, text: 'Tim, ini kampanye terbesar kuartal ini. Tolong update progres di task masing-masing ya.' },
      {
        by: 'manager',
        ago: 30,
        text: '@Budi Santoso budget iklan sudah disetujui Rp 150 juta, bisa mulai siapkan struktur campaign.',
        mentions: ['budi'],
        replies: [{ by: 'budi', ago: 26, text: 'Siap, draft struktur campaign saya taruh di task Setup iklan minggu ini.' }],
      },
    ],
    tasks: [
      {
        title: 'Riset kompetitor & tren belanja',
        status: 'done',
        priority: 'high',
        assignee: 'researcher',
        start: -10,
        days: 5,
        tags: ['riset'],
        comments: [
          { by: 'researcher', ago: 150, text: 'Ringkasan: 3 dari 5 kompetitor memberi gratis ongkir tanpa minimum belanja; diskon rata-rata 35%.' },
          { by: 'manager', ago: 140, text: 'Mantap, insight gratis ongkir kita pakai di strategi promo.' },
        ],
        subtasks: [
          { title: 'Analisis promo kompetitor', status: 'done', assignee: 'researcher', start: -10, days: 3, tags: ['riset'] },
          { title: 'Survei preferensi pelanggan', status: 'done', assignee: 'member', start: -8, days: 3, tags: ['riset'] },
        ],
      },
      {
        title: 'Strategi promo & mekanisme diskon',
        status: 'in_review',
        priority: 'urgent',
        assignee: 'manager',
        start: -5,
        days: 8,
        tags: ['strategi'],
        comments: [
          {
            by: 'owner',
            ago: 20,
            text: 'Flash sale jam 12 siang dan jam 9 malam oke. Pastikan stok produk hero cukup.',
            replies: [{ by: 'manager', ago: 18, text: 'Sudah koordinasi dengan gudang, stok aman untuk 3x proyeksi.' }],
          },
        ],
      },
      {
        title: 'Produksi konten visual',
        status: 'in_progress',
        priority: 'high',
        assignee: 'sari',
        start: -2,
        days: 20,
        tags: ['desain', 'konten'],
        subtasks: [
          {
            title: 'Desain banner homepage & marketplace',
            status: 'in_progress',
            assignee: 'sari',
            start: -2,
            days: 8,
            tags: ['desain'],
            comments: [{ by: 'andi', ago: 6, text: '@Sari Wulandari headline final: "12.12 Serba Untung — Diskon s.d. 70%".', mentions: ['sari'] }],
          },
          { title: 'Video teaser 15 detik', status: 'todo', assignee: 'sari', start: 5, days: 10, tags: ['video'] },
          { title: 'Copywriting caption Instagram & TikTok', status: 'in_progress', assignee: 'andi', start: 0, days: 9, tags: ['konten'] },
        ],
      },
      {
        title: 'Brief KOL & influencer',
        status: 'todo',
        priority: 'medium',
        assignee: 'strategist',
        start: 8,
        days: 12,
        tags: ['influencer'],
        comments: [{ by: 'manager', ago: 10, text: 'Prioritaskan micro-influencer (10–50 ribu followers) di kategori fashion & beauty.' }],
      },
      { title: 'Setup iklan Meta & Google Ads', status: 'todo', priority: 'high', assignee: 'budi', start: 15, days: 15, tags: ['iklan'] },
      { title: 'Email blast ke database pelanggan', status: 'todo', priority: 'medium', assignee: 'andi', start: harbolnas - 7, days: 7, tags: ['email'] },
      { title: 'Hari H Harbolnas 12.12', status: 'todo', priority: 'urgent', start: harbolnas, milestone: true },
      { title: 'Laporan hasil kampanye', status: 'todo', priority: 'low', assignee: 'manager', start: harbolnas + 1, days: 6, tags: ['laporan'] },
    ],
  },
  {
    title: 'Rebranding Media Sosial',
    icon: '🎨',
    description: 'Penyegaran identitas visual & tone of voice di Instagram, TikTok, dan LinkedIn.',
    createdAgo: 27,
    brief: [
      ['heading', 'Rebranding Media Sosial', { level: 1 }],
      ['paragraph', 'Identitas lama terasa kaku. Kita ingin tampil lebih hangat, konsisten, dan mudah dikenali di semua kanal.'],
      ['heading', 'Prinsip', { level: 2 }],
      ['bulletListItem', 'Satu palet warna utama + dua warna aksen'],
      ['bulletListItem', 'Tone: ramah, optimis, tanpa jargon'],
      ['bulletListItem', 'Template feed & story yang bisa dipakai ulang tim'],
      ['heading', 'Checklist', { level: 2 }],
      ['checkListItem', 'Audit akun selesai', { checked: true }],
      ['checkListItem', 'Panduan visual disetujui', { checked: true }],
      ['checkListItem', 'Kalender konten November terbit', { checked: false }],
    ],
    comments: [
      { by: 'owner', ago: 400, text: 'Referensi yang saya suka: brand lokal yang konsisten pakai warna & ilustrasi. Silakan eksplor.' },
      { by: 'sari', ago: 100, text: 'Panduan visual v2 sudah di-upload, mohon review sebelum Jumat.', replies: [{ by: 'owner', ago: 90, text: 'Approved 👍' }] },
    ],
    tasks: [
      {
        title: 'Audit akun media sosial',
        status: 'done',
        priority: 'medium',
        assignee: 'researcher',
        start: -25,
        days: 6,
        tags: ['riset'],
        comments: [{ by: 'researcher', ago: 480, text: 'Engagement rate rata-rata 1,8%; konten carousel edukatif performa terbaik (3,4%).' }],
      },
      {
        title: 'Moodboard & panduan visual baru',
        status: 'done',
        priority: 'high',
        assignee: 'sari',
        start: -19,
        days: 8,
        tags: ['desain'],
        subtasks: [
          { title: 'Palet warna & tipografi', status: 'done', assignee: 'sari', start: -19, days: 5, tags: ['desain'] },
          { title: 'Template feed & story', status: 'done', assignee: 'sari', start: -14, days: 3, tags: ['desain'] },
        ],
      },
      {
        title: 'Panduan tone of voice',
        status: 'in_review',
        priority: 'medium',
        assignee: 'andi',
        start: -10,
        days: 8,
        tags: ['konten'],
        comments: [
          {
            by: 'manager',
            ago: 28,
            text: '@Andi Pratama tambahkan contoh do & don\'t untuk balasan komentar negatif ya.',
            mentions: ['andi'],
            replies: [{ by: 'andi', ago: 22, text: 'Sudah ditambahkan 6 contoh di bagian akhir dokumen.' }],
          },
        ],
      },
      {
        title: 'Kalender konten November',
        status: 'in_progress',
        priority: 'high',
        assignee: 'strategist',
        start: -4,
        days: 8,
        tags: ['konten'],
        comments: [{ by: 'strategist', ago: 5, text: 'Draft 24 konten siap: 40% edukasi, 30% promo, 20% behind the scene, 10% UGC.' }],
      },
      { title: 'Ganti foto profil & highlight', status: 'todo', priority: 'low', assignee: 'member', start: 4, days: 2, tags: ['sosmed'] },
      { title: 'Peluncuran identitas baru', status: 'todo', priority: 'high', start: 7, milestone: true },
      { title: 'Evaluasi engagement 30 hari', status: 'todo', priority: 'medium', assignee: 'manager', start: 37, days: 3, tags: ['laporan'] },
    ],
  },
  {
    title: 'Peluncuran Kopi Susu Gula Aren',
    icon: '☕',
    description: 'Go-to-market produk minuman baru: kemasan, sampling, pre-order, dan launching.',
    createdAgo: 4,
    brief: [
      ['heading', 'Peluncuran Kopi Susu Gula Aren', { level: 1 }],
      ['paragraph', 'Produk RTD (ready to drink) 250 ml, harga target Rp 18.000, dijual di cabang & aplikasi pesan antar.'],
      ['heading', 'Pesan utama', { level: 2 }],
      ['paragraph', 'Rasa kopi kekinian dengan gula aren asli — praktis dibawa ke mana saja.'],
      ['heading', 'Milestone', { level: 2 }],
      ['checkListItem', 'Nama & kemasan final', { checked: false }],
      ['checkListItem', 'Soft launch 3 cabang', { checked: false }],
      ['checkListItem', 'Grand launch', { checked: false }],
    ],
    comments: [
      { by: 'owner', ago: 90, text: 'Target 10.000 botol terjual di bulan pertama. Kita kejar soft launch sebelum akhir tahun.' },
    ],
    tasks: [
      {
        title: 'Riset harga & positioning',
        status: 'in_progress',
        priority: 'high',
        assignee: 'researcher',
        start: -3,
        days: 7,
        tags: ['riset'],
        comments: [
          { by: 'researcher', ago: 12, text: 'Rentang harga kompetitor Rp 15.000–25.000. Posisi Rp 18.000 masuk segmen value-premium.' },
          { by: 'owner', ago: 8, text: '@Agent_Researcher tolong tambahkan perbandingan ukuran kemasan juga.', mentions: ['researcher'] },
        ],
      },
      {
        title: 'Penamaan & desain kemasan',
        status: 'todo',
        priority: 'high',
        assignee: 'sari',
        start: 2,
        days: 14,
        tags: ['desain'],
        subtasks: [
          {
            title: 'Shortlist 5 nama produk',
            status: 'in_progress',
            assignee: 'andi',
            start: -1,
            days: 4,
            tags: ['konten'],
            comments: [{ by: 'andi', ago: 3, text: 'Kandidat: Aren Kita, Susu Aren, Kopi Pagi, Ngopi Aren, Aren Nusantara.' }],
          },
          { title: 'Mockup kemasan botol', status: 'todo', assignee: 'sari', start: 6, days: 10, tags: ['desain'] },
        ],
      },
      { title: 'Sesi foto produk', status: 'todo', priority: 'medium', assignee: 'budi', start: 17, days: 2, tags: ['konten'] },
      { title: 'Landing page pre-order', status: 'todo', priority: 'high', assignee: 'member', start: 18, days: 10, tags: ['web'] },
      { title: 'Program sampling di kantor mitra', status: 'todo', priority: 'medium', assignee: 'manager', start: 22, days: 14, tags: ['offline'] },
      { title: 'Soft launch di 3 cabang', status: 'todo', priority: 'high', start: 40, milestone: true },
      { title: 'Grand launch', status: 'todo', priority: 'urgent', start: 60, milestone: true },
    ],
  },
];

async function main(): Promise<void> {
  assertNotProduction();
  const prisma = createScriptClient();

  const ws = await prisma.workspaces.findUnique({ where: { id: SEED_IDS.wsDemo } });
  if (!ws) throw new Error('Workspace demo belum ada. Jalankan dulu: npm run db:seed');

  // ---------- User tambahan ----------
  const password = process.env.SEED_DEMO_PASSWORD || 'Demo12345!';
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  for (const u of NEW_USERS) {
    await prisma.users.upsert({
      where: { id: u.id },
      create: { id: u.id, email: u.email, username: u.username, display_name: u.name, password_hash: hash },
      update: { password_hash: hash, is_active: true },
    });
    await prisma.workspace_members.upsert({
      where: { workspace_id_user_id: { workspace_id: SEED_IDS.wsDemo, user_id: u.id } },
      create: { workspace_id: SEED_IDS.wsDemo, user_id: u.id, role: 'member' },
      update: {},
    });
  }

  let taskN = 0;
  let blockN = 0;
  let commentN = 0;
  let activityN = 0;
  let taskCount = 0;
  let commentCount = 0;

  const log = (projectId: string, entity: { type: 'project' | 'task'; id: string }, action: string, by: ActorKey, at: Date, metadata: Record<string, unknown>) =>
    prisma.activity_logs.upsert({
      where: { id: id(6, ++activityN) },
      create: {
        id: id(6, activityN),
        workspace_id: SEED_IDS.wsDemo,
        project_id: projectId,
        entity_type: entity.type,
        entity_id: entity.id,
        action,
        actor_type: ACTORS[by].type,
        actor_id: ACTORS[by].id,
        metadata_json: metadata as Prisma.InputJsonValue,
        created_at: at,
      },
      update: {},
    });

  const addComments = async (projectId: string, entity: { type: 'project' | 'task'; id: string }, list: CommentSeed[] | undefined, taskId: string | null, parentId: string | null = null) => {
    for (const c of list ?? []) {
      const actor = ACTORS[c.by];
      const commentId = id(5, ++commentN);
      const at = hoursAgo(c.ago);
      await prisma.comments.upsert({
        where: { id: commentId },
        create: {
          id: commentId,
          project_id: projectId,
          entity_type: entity.type,
          entity_id: entity.id,
          parent_comment_id: parentId,
          author_type: actor.type,
          author_user_id: actor.type === 'user' ? actor.id : null,
          author_agent_id: actor.type === 'agent' ? actor.id : null,
          content: c.text,
          mentions: (c.mentions ?? []).map((k) => ({ type: ACTORS[k].type, id: ACTORS[k].id })),
          created_at: at,
          updated_at: at,
        },
        update: {},
      });
      commentCount++;
      const excerpt = c.text.length > 80 ? `${c.text.slice(0, 80)}…` : c.text;
      await log(projectId, entity, 'comment.created', c.by, at, { comment_id: commentId, excerpt, task_id: taskId });
      await addComments(projectId, entity, c.replies, taskId, commentId);
    }
  };

  for (const [pi, p] of PROJECTS.entries()) {
    const projectId = id(2, pi + 1);
    const createdAt = day(-p.createdAgo);
    await prisma.projects.upsert({
      where: { id: projectId },
      create: { id: projectId, workspace_id: SEED_IDS.wsDemo, title: p.title, icon: p.icon, description: p.description, created_by: SEED_IDS.owner, created_at: createdAt },
      update: {},
    });
    await log(projectId, { type: 'project', id: projectId }, 'project.created', 'owner', createdAt, {});

    for (const [i, [type, text, props]] of p.brief.entries()) {
      const res = validateBlockContent(type, { props: props ?? {}, content: [{ type: 'text', text, styles: {} }] });
      if (!res.ok) throw new Error(`Blok brief tidak valid (${p.title}): ${JSON.stringify(res.issues)}`);
      const blockId = id(4, ++blockN);
      await prisma.document_blocks.upsert({
        where: { id: blockId },
        create: {
          id: blockId,
          project_id: projectId,
          task_id: null,
          block_type: type,
          content_json: res.content as unknown as Prisma.InputJsonValue,
          plain_text: extractPlainText(type, res.content),
          order_index: i,
          last_edited_by_type: 'user',
          last_edited_by_id: SEED_IDS.owner,
        },
        update: {},
      });
    }

    let order = 0;
    const addTask = async (t: TaskSeed, parentId: string | null, depth: number) => {
      const taskId = id(3, ++taskN);
      const status = t.status ?? 'todo';
      const start = day(t.start);
      const end = day(t.start + (t.milestone ? 0 : (t.days ?? 1) - 1));
      const assignee = t.assignee ? ACTORS[t.assignee] : null;
      const created = new Date(Math.min(createdAt.getTime() + DAY / 2, now.getTime()));
      await prisma.tasks.upsert({
        where: { id: taskId },
        create: {
          id: taskId,
          project_id: projectId,
          parent_task_id: parentId,
          depth,
          title: t.title,
          status,
          priority: t.priority ?? 'none',
          assignee_type: assignee?.type ?? null,
          assignee_user_id: assignee?.type === 'user' ? assignee.id : null,
          assignee_agent_id: assignee?.type === 'agent' ? assignee.id : null,
          agent_status: assignee?.type === 'agent' ? (status === 'done' ? 'completed' : 'idle') : 'idle',
          start_date: start,
          end_date: end,
          is_milestone: !!t.milestone,
          tags: t.tags ?? [],
          order_index: order++,
          created_by_type: 'user',
          created_by_id: SEED_IDS.owner,
          completed_at: status === 'done' ? new Date(end.getTime() + DAY - 1) : null,
          created_at: created,
        },
        update: {},
      });
      taskCount++;
      const entity = { type: 'task' as const, id: taskId };
      await log(projectId, entity, 'task.created', 'owner', created, { title: t.title, parent_task_id: parentId });
      if (assignee) await log(projectId, entity, 'task.assigned', 'manager', created, { to: { type: assignee.type, id: assignee.id, name: assignee.name } });
      if (status !== 'todo') {
        const by = t.assignee && ACTORS[t.assignee].type === 'user' ? t.assignee : 'manager';
        const at = new Date(Math.min(start.getTime() + 9 * 3_600_000, now.getTime()));
        await log(projectId, entity, 'task.status_changed', by, at, { from: 'todo', to: status });
      }
      await addComments(projectId, entity, t.comments, taskId);
      for (const s of t.subtasks ?? []) await addTask(s, taskId, depth + 1);
    };
    for (const t of p.tasks) await addTask(t, null, 1);

    await addComments(projectId, { type: 'project', id: projectId }, p.comments, null);
  }

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log(
    `Seed dummy selesai: ${PROJECTS.length} project, ${taskCount} task, ${commentCount} komentar.\n` +
      `User baru (password: ${password}): ${NEW_USERS.map((u) => u.email).join(', ')}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
