import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { SEED_IDS } from './seed-ids';
import { assertNotProduction, createScriptClient } from './seed-client';

/**
 * Data besar untuk performance test (TASK_008 §B): 1 project berisi 1000 task (3 level)
 * dan 1 task berisi 1000 blok. Jalankan setelah db:seed: npm run db:seed:large
 */
const LARGE_PROJECT_ID = '00000000-0000-4000-8000-000000000302';
const LARGE_DOC_TASK_ID = '00000000-0000-4000-8000-000000000499';

async function main(): Promise<void> {
  assertNotProduction();
  const prisma = createScriptClient();
  const exists = await prisma.projects.findUnique({ where: { id: LARGE_PROJECT_ID } });
  if (exists) {
    // eslint-disable-next-line no-console
    console.log('Project besar sudah ada, dilewati.');
    await prisma.$disconnect();
    return;
  }

  await prisma.projects.create({
    data: { id: LARGE_PROJECT_ID, workspace_id: SEED_IDS.wsDemo, title: 'Large Project (1000 task)', icon: '📈', created_by: SEED_IDS.owner },
  });

  const base = Date.UTC(new Date().getUTCFullYear(), 10, 1);
  const day = (n: number) => new Date(base + n * 86_400_000);
  const statuses = ['todo', 'in_progress', 'in_review', 'done'] as const;
  const common = { project_id: LARGE_PROJECT_ID, created_by_type: 'user' as const, created_by_id: SEED_IDS.owner };
  const roots: Prisma.tasksCreateManyInput[] = [];
  const level2: Prisma.tasksCreateManyInput[] = [];
  const level3: Prisma.tasksCreateManyInput[] = [];

  // 100 root × 3 anak × 2 cucu = 100 + 300 + 600 = 1000 task
  for (let r = 0; r < 100; r++) {
    const rootId = randomUUID();
    const start = r % 60;
    roots.push({ ...common, id: rootId, title: `Epic ${r + 1}`, depth: 1, status: statuses[r % 4], order_index: r, start_date: day(start), end_date: day(start + 9) });
    for (let c = 0; c < 3; c++) {
      const childId = randomUUID();
      level2.push({ ...common, id: childId, parent_task_id: rootId, title: `Task ${r + 1}.${c + 1}`, depth: 2, order_index: c, start_date: day(start + c * 3), end_date: day(start + c * 3 + 2) });
      for (let g = 0; g < 2; g++) {
        level3.push({ ...common, id: randomUUID(), parent_task_id: childId, title: `Subtask ${r + 1}.${c + 1}.${g + 1}`, depth: 3, order_index: g, start_date: day(start + c * 3 + g), end_date: day(start + c * 3 + g + 1) });
      }
    }
  }
  await prisma.tasks.createMany({ data: roots });
  await prisma.tasks.createMany({ data: level2 });
  await prisma.tasks.createMany({ data: level3 });

  await prisma.tasks.create({ data: { ...common, id: LARGE_DOC_TASK_ID, title: 'Large Document (1000 blok)', depth: 1, order_index: 100 } });
  const blocks: Prisma.document_blocksCreateManyInput[] = Array.from({ length: 1000 }, (_, i) => {
    const text = `Paragraf ${i + 1}: lorem ipsum strategi konten, kampanye, audiens, dan kanal distribusi.`;
    return {
      id: randomUUID(),
      project_id: LARGE_PROJECT_ID,
      task_id: LARGE_DOC_TASK_ID,
      block_type: i % 20 === 0 ? 'heading' : 'paragraph',
      content_json: { props: i % 20 === 0 ? { level: 2 } : {}, content: [{ type: 'text', text, styles: {} }] },
      plain_text: text,
      order_index: i,
      last_edited_by_type: 'user',
      last_edited_by_id: SEED_IDS.owner,
    };
  });
  await prisma.document_blocks.createMany({ data: blocks });

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log(`Seed besar selesai: project ${LARGE_PROJECT_ID} (1000 task) + task ${LARGE_DOC_TASK_ID} (1000 blok).`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
