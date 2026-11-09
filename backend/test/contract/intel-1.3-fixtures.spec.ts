/**
 * Contract test kontrak 1.3 (DSH-V1-00): fixture bersama `contracts/1.3/` divalidasi dengan Zod Dashboard.
 * Fixture valid harus lolos; fixture invalid harus ditolak pada path yang sama dengan Pydantic MCP.
 * Bangkitkan ulang fixture: `npm run contract:fixtures`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  Event13Type,
  event13DataSchemas,
  event13EnvelopeSchema,
  isEvent13Body,
  jobAccepted13Schema,
  jobCreate13InputSchema,
  jobEstimate13InputSchema,
  jobResumeInputSchema,
  jobResumeOutputSchema,
  jobReviewInputSchema,
  jobReviewOutputSchema,
  jobSpec13Schema,
  jobView13Schema,
  estimate13Schema,
} from '../../src/shared/schemas/intel-1.3.schema';
import {
  ciCompanyListInputSchema,
  ciCompanyListSchema,
  ciGeoClustersInputSchema,
  companyProfileSchema,
  ctBatchSchema,
  dataExportInputSchema,
  dataExportSchema,
  geoClustersSchema,
  knAssetListSchema,
  miKpisInputSchema,
  miKpisSchema,
  oppExplainSchema,
  oppListInputSchema,
  oppListSchema,
  uploadAcceptedSchema,
} from '../../src/shared/schemas/intel-1.3-tools.schema';
import { intelEventEnvelopeSchema, isIntelEventBody } from '../../src/shared/schemas/intel.schema';

const CONTRACT = resolve(__dirname, '../../../contracts/1.3');
const FIXTURES = join(CONTRACT, 'fixtures');

interface Fixture {
  name: string;
  schema: string;
  valid: boolean;
  payload: unknown;
  expect_path?: string;
}

const SCHEMAS: Record<string, z.ZodType> = {
  job_spec: jobSpec13Schema,
  job_estimate_input: jobEstimate13InputSchema,
  job_create_input: jobCreate13InputSchema,
  job_review_input: jobReviewInputSchema,
  job_resume_input: jobResumeInputSchema,
  estimate: estimate13Schema,
  job_accepted: jobAccepted13Schema,
  job_view: jobView13Schema,
  job_review_output: jobReviewOutputSchema,
  job_resume_output: jobResumeOutputSchema,
  upload_accepted: uploadAcceptedSchema,
  mi_kpis_input: miKpisInputSchema,
  mi_kpis: miKpisSchema,
  ci_company_list_input: ciCompanyListInputSchema,
  ci_company_list: ciCompanyListSchema,
  company_profile: companyProfileSchema,
  ci_geo_clusters_input: ciGeoClustersInputSchema,
  geo_clusters: geoClustersSchema,
  opp_list_input: oppListInputSchema,
  opp_list: oppListSchema,
  opp_explain: oppExplainSchema,
  ct_batch: ctBatchSchema,
  kn_asset_list: knAssetListSchema,
  data_export_input: dataExportInputSchema,
  data_export: dataExportSchema,
};

const files = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .sort();
const load = (file: string): Fixture => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Fixture;
/** Path gaya Pydantic: field asing (`unrecognized_keys`) dilaporkan per nama field. */
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
  const env = event13EnvelopeSchema.safeParse(fx.payload);
  if (!env.success) return paths(env.error);
  const data = event13DataSchemas[env.data.event_type as Event13Type].safeParse(env.data.data);
  return data.success ? [] : paths(data.error, 'data.');
}

describe('kontrak 1.3 — fixture bersama', () => {
  it('fixture tersedia (jalankan npm run contract:fixtures bila kosong)', () => {
    expect(files.length).toBeGreaterThan(60);
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

  it('setiap kind job punya fixture valid', () => {
    const kinds = files.filter((f) => f.startsWith('valid_spec_')).map((f) => (load(f).payload as { kind: string }).kind);
    expect(new Set(kinds)).toEqual(new Set(['company_discovery', 'company_import', 'contact_finder', 'social_listening', 'book_ingest', 'opportunity_scoring', 'strategy', 'content_bank']));
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

  it('default aman: llm_assist mati & budget_usd null bila tidak diisi', () => {
    const spec = jobSpec13Schema.parse({ kind: 'opportunity_scoring', title: 'x', params: { product_id: '44444444-4444-4444-8444-444444444444' } });
    expect(spec).toMatchObject({ llm_assist: false, budget_usd: null, agents: {}, language: 'id' });
  });
});

describe('kontrak 1.3 — routing event tidak mengubah perilaku Modul 3', () => {
  const v12 = JSON.parse(readFileSync(resolve(__dirname, '../../../contracts/intel-1.2/fixtures/valid_event_started.json'), 'utf8')).payload;

  it('event 1.2 tetap ke penerima 1.2 dan tidak diklaim penerima 1.3', () => {
    expect(isEvent13Body(v12)).toBe(false);
    expect(isIntelEventBody(v12)).toBe(true);
    expect(intelEventEnvelopeSchema.safeParse(v12).success).toBe(true);
  });

  it('event tipe baru selalu ke penerima 1.3 (dan ditolak envelope 1.2)', () => {
    const paused = load('valid_event_paused_captcha.json').payload;
    const batch = load('valid_event_batch_ready.json').payload;
    expect(isEvent13Body(paused)).toBe(true);
    expect(isEvent13Body(batch)).toBe(true);
    expect(intelEventEnvelopeSchema.safeParse(paused).success).toBe(false);
  });

  it('event job lama dengan contract_version 1.3 ke penerima 1.3', () => {
    expect(isEvent13Body({ ...v12, contract_version: '1.3' })).toBe(true);
    expect(isEvent13Body({ event_type: 'agent.task.started', contract_version: '1.3' })).toBe(false);
    expect(isEvent13Body(null)).toBe(false);
  });
});
