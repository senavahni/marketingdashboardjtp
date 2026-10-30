import * as argon2 from 'argon2';
import { Prisma, workspace_role } from '../../generated/prisma/client';
import { extractPlainText, validateBlockContent } from '../../shared/schemas/block.schema';
import { SEED_IDS } from './seed-ids';
import { assertNotProduction, createScriptClient } from './seed-client';

/**
 * Seed data demo (idempotent) — sesuai M1_ARCHITECTURE §10.
 * Jalankan: npm run db:seed
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main(): Promise<void> {
  assertNotProduction();
  const prisma = createScriptClient();
  const password = process.env.SEED_DEMO_PASSWORD || 'Demo12345!';
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const year = new Date().getUTCFullYear();

  const users: { id: string; email: string; username: string; name: string }[] = [
    { id: SEED_IDS.owner, email: 'owner@demo.local', username: 'owner_demo', name: 'Owner Demo' },
    { id: SEED_IDS.manager, email: 'manager@demo.local', username: 'manager_demo', name: 'Manager Demo' },
    { id: SEED_IDS.member, email: 'member@demo.local', username: 'member_demo', name: 'Member Demo' },
    { id: SEED_IDS.viewer, email: 'viewer@demo.local', username: 'viewer_demo', name: 'Viewer Demo' },
    { id: SEED_IDS.outsider, email: 'outsider@demo.local', username: 'outsider_demo', name: 'Outsider Demo' },
  ];
  for (const u of users) {
    await prisma.users.upsert({
      where: { id: u.id },
      create: { id: u.id, email: u.email, username: u.username, display_name: u.name, password_hash: hash },
      update: { password_hash: hash, is_active: true },
    });
  }

  await prisma.workspaces.upsert({
    where: { id: SEED_IDS.wsDemo },
    create: { id: SEED_IDS.wsDemo, name: 'Marketing Demo', owner_id: SEED_IDS.owner },
    update: { name: 'Marketing Demo' },
  });
  await prisma.workspaces.upsert({
    where: { id: SEED_IDS.wsOutsider },
    create: { id: SEED_IDS.wsOutsider, name: 'Outsider WS', owner_id: SEED_IDS.outsider },
    update: {},
  });

  const memberships: [string, string, workspace_role][] = [
    [SEED_IDS.wsDemo, SEED_IDS.owner, 'owner'],
    [SEED_IDS.wsDemo, SEED_IDS.manager, 'admin'],
    [SEED_IDS.wsDemo, SEED_IDS.member, 'member'],
    [SEED_IDS.wsDemo, SEED_IDS.viewer, 'viewer'],
    [SEED_IDS.wsOutsider, SEED_IDS.outsider, 'owner'],
  ];
  for (const [ws, user, role] of memberships) {
    await prisma.workspace_members.upsert({
      where: { workspace_id_user_id: { workspace_id: ws, user_id: user } },
      create: { workspace_id: ws, user_id: user, role },
      update: { role },
    });
  }

  for (const a of [
    { id: SEED_IDS.strategist, name: 'Agent_Strategist', handle: 'Agent_Strategist', key: 'strategist', desc: 'Menyusun strategi & kalender konten' },
    { id: SEED_IDS.researcher, name: 'Agent_Researcher', handle: 'Agent_Researcher', key: 'researcher', desc: 'Riset pasar & kompetitor' },
  ]) {
    await prisma.agents.upsert({
      where: { id: a.id },
      create: { id: a.id, workspace_id: SEED_IDS.wsDemo, name: a.name, handle: a.handle, mcp_agent_key: a.key, description: a.desc, created_by: SEED_IDS.owner },
      update: {},
    });
  }

  await prisma.projects.upsert({
    where: { id: SEED_IDS.project },
    create: { id: SEED_IDS.project, workspace_id: SEED_IDS.wsDemo, title: 'Q4 Product Launch', icon: '🚀', created_by: SEED_IDS.owner },
    update: {},
  });

  const tasks: Prisma.tasksUncheckedCreateInput[] = [
    { id: SEED_IDS.marketResearch, title: 'Market Research', depth: 1, priority: 'high', start_date: d(`${year}-11-01`), end_date: d(`${year}-11-05`), order_index: 0, tags: ['research'] },
    { id: SEED_IDS.scrapeTwitter, parent_task_id: SEED_IDS.marketResearch, title: 'Scrape Twitter', depth: 2, start_date: d(`${year}-11-01`), end_date: d(`${year}-11-02`), order_index: 1 },
    { id: SEED_IDS.scrapeMeta, parent_task_id: SEED_IDS.marketResearch, title: 'Scrape Meta', depth: 2, start_date: d(`${year}-11-04`), end_date: d(`${year}-11-05`), order_index: 2 },
    { id: SEED_IDS.launchDay, title: 'Launch Day', depth: 1, priority: 'urgent', is_milestone: true, start_date: d(`${year}-11-20`), end_date: d(`${year}-11-20`), order_index: 3 },
  ].map((t) => ({ ...t, project_id: SEED_IDS.project, created_by_type: 'user', created_by_id: SEED_IDS.owner }) as Prisma.tasksUncheckedCreateInput);
  for (const t of tasks) await prisma.tasks.upsert({ where: { id: t.id as string }, create: t, update: {} });

  const brief: [string, string, unknown][] = [
    [SEED_IDS.brief1, 'heading', { props: { level: 1 }, content: [{ type: 'text', text: 'Brief Kampanye Q4', styles: {} }] }],
    [
      SEED_IDS.brief2,
      'paragraph',
      { props: {}, content: [{ type: 'text', text: 'Target audiens: profesional muda 25–35 tahun di kota besar yang aktif di Instagram dan LinkedIn.', styles: {} }] },
    ],
    [
      SEED_IDS.brief3,
      'paragraph',
      { props: {}, content: [{ type: 'text', text: 'Tone of voice: profesional namun hangat, optimis, hindari jargon teknis berlebihan.', styles: {} }] },
    ],
  ];
  for (const [i, [id, type, raw]] of brief.entries()) {
    const res = validateBlockContent(type, raw);
    if (!res.ok) throw new Error(`Seed block invalid: ${JSON.stringify(res.issues)}`);
    await prisma.document_blocks.upsert({
      where: { id },
      create: {
        id,
        project_id: SEED_IDS.project,
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

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log(`Seed selesai. Login: owner@demo.local / manager@demo.local / member@demo.local / viewer@demo.local / outsider@demo.local (password: SEED_DEMO_PASSWORD)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
