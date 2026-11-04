/**
 * Contract test kontrak 1.2 (toolset `intel`): fixture bersama `contracts/intel-1.2/` yang dibangkitkan
 * repo MCP (`scripts/export_intel_fixtures.py --dashboard ...`) divalidasi dengan Zod Dashboard.
 * Fixture valid harus lolos; fixture invalid harus ditolak pada path yang sama dengan Pydantic.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  agentsListSchema,
  cancelOutputSchema,
  estimateSchema,
  intelEventDataSchemas,
  intelEventEnvelopeSchema,
  IntelEventType,
  isIntelEventBody,
  itemsInputSchema,
  itemsPageSchema,
  jobAcceptedSchema,
  jobCreateInputSchema,
  jobEstimateInputSchema,
  jobSpecSchema,
  jobViewSchema,
  llmStatusSchema,
  sourcesStatusSchema,
} from '../../src/shared/schemas/intel.schema';
import { webhookEnvelopeSchema } from '../../src/shared/schemas/mcp.schema';

const CONTRACT = resolve(__dirname, '../../../contracts/intel-1.2');
const FIXTURES = join(CONTRACT, 'fixtures');

interface Fixture {
  name: string;
  schema: string;
  valid: boolean;
  payload: unknown;
  expect_path?: string;
}

const SCHEMAS: Record<string, z.ZodType> = {
  job_spec: jobSpecSchema,
  job_estimate_input: jobEstimateInputSchema,
  job_create_input: jobCreateInputSchema,
  items_input: itemsInputSchema,
  agents_list: agentsListSchema,
  sources_status: sourcesStatusSchema,
  estimate: estimateSchema,
  job_accepted: jobAcceptedSchema,
  job_view: jobViewSchema,
  cancel: cancelOutputSchema,
  items_page: itemsPageSchema,
  llm_status: llmStatusSchema,
};

const files = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .sort();
const load = (file: string): Fixture => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Fixture;
/** Path gaya Pydantic: field asing (`unrecognized_keys`) dilaporkan per nama field, bukan di objek induk. */
const paths = (error: z.ZodError, prefix = ''): string[] =>
  error.issues.flatMap((i) => {
    const base = i.path.map(String);
    const keys = i.code === 'unrecognized_keys' ? i.keys : [undefined];
    return keys.map((k) => prefix + [...base, ...(k ? [k] : [])].join('.'));
  });

function errorsOf(fx: Fixture): string[] {
  if (fx.schema !== 'event') {
    const schema = SCHEMAS[fx.schema];
    if (!schema) throw new Error(`schema fixture tidak dikenal: ${fx.schema}`);
    const r = schema.safeParse(fx.payload);
    return r.success ? [] : paths(r.error);
  }
  const env = intelEventEnvelopeSchema.safeParse(fx.payload);
  if (!env.success) return paths(env.error);
  const data = intelEventDataSchemas[env.data.event_type as IntelEventType].safeParse(env.data.data);
  return data.success ? [] : paths(data.error, 'data.');
}

describe('kontrak intel 1.2 — fixture bersama', () => {
  it('fixture tersedia (jalankan export_intel_fixtures.py --dashboard bila kosong)', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('checksum cocok dengan SHA256SUMS (fixture identik dengan repo MCP)', () => {
    const expected = new Map(
      readFileSync(join(CONTRACT, 'SHA256SUMS'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => {
          const [digest, name] = line.split('  ');
          return [name, digest] as const;
        }),
    );
    for (const file of files) {
      const digest = createHash('sha256').update(readFileSync(join(FIXTURES, file))).digest('hex');
      expect(expected.get(`fixtures/${file}`)).toBe(digest);
    }
    expect(expected.size).toBe(files.length);
  });

  it.each(files)('%s', (file) => {
    const fx = load(file);
    const errors = errorsOf(fx);
    if (fx.valid) {
      expect(errors).toEqual([]);
    } else {
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((p) => p.startsWith(fx.expect_path ?? ''))).toBe(true);
    }
  });

  it('event intel dikenali sebagai varian job, envelope run Modul 1 tidak terpengaruh', () => {
    const intel = load('valid_event_started.json').payload;
    expect(isIntelEventBody(intel)).toBe(true);
    expect(webhookEnvelopeSchema.safeParse(intel).success).toBe(false);
    const run = {
      contract_version: '1.0',
      event_id: '66666666-6666-4666-8666-666666666666',
      event_type: 'agent.task.started',
      occurred_at: '2026-11-04T01:00:00Z',
      run_id: '11111111-1111-4111-8111-111111111111',
      agent_id: '22222222-2222-4222-8222-222222222222',
      data: {},
    };
    expect(isIntelEventBody(run)).toBe(false);
    expect(webhookEnvelopeSchema.safeParse(run).success).toBe(true);
  });
});
