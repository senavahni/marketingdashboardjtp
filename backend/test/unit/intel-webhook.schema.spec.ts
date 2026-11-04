import { intelEventEnvelopeSchema, intelEventDataSchemas, isIntelEventBody, webSourceSchema } from '../../src/shared/schemas/intel.schema';
import { mcpWebhookEnvelopeSchema } from '../../src/shared/schemas/mcp.schema';

const event = {
  contract_version: '1.2',
  event_id: '66666666-6666-4666-8666-666666666666',
  event_type: 'intel.job.completed',
  occurred_at: '2026-11-04T01:00:00Z',
  job_id: '55555555-5555-4555-8555-555555555555',
  mcp_job_id: 'j_k3m9x2qa1b',
  sequence: 1,
  data: {
    summary_preview: 'Sentimen dominan positif',
    totals: { items: 500, by_source: { x: 500 } },
    cost: { llm_tokens: 10, usd_llm: 0.1, external_units: 500, usd_external: 0, by_stage: [] },
    partial: false,
  },
};

describe('intel webhook schemas', () => {
  it('accepts contract 1.2 intel events and validates event data', () => {
    const parsed = intelEventEnvelopeSchema.parse(event);

    expect(parsed.mcp_job_id).toBe('j_k3m9x2qa1b');
    expect(intelEventDataSchemas[parsed.event_type].parse(parsed.data)).toMatchObject({
      totals: { items: 500 },
    });
  });

  it('dispatches intel events separately from Modul 1 run envelopes', () => {
    expect(isIntelEventBody(event)).toBe(true);
    expect(mcpWebhookEnvelopeSchema.safeParse(event).success).toBe(true);
    expect(
      mcpWebhookEnvelopeSchema.safeParse({
        ...event,
        job_id: undefined,
        run_id: '55555555-5555-4555-8555-555555555555',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields and non-positive sequence values', () => {
    expect(intelEventEnvelopeSchema.safeParse({ ...event, extra: true }).success).toBe(false);
    expect(intelEventEnvelopeSchema.safeParse({ ...event, sequence: 0 }).success).toBe(false);
  });

  it('rejects private network URLs in web source specs', () => {
    expect(webSourceSchema.safeParse({ type: 'web', mode: 'scrape', urls: ['http://127.0.0.1/admin'] }).success).toBe(false);
    expect(webSourceSchema.safeParse({ type: 'web', mode: 'scrape', urls: ['https://example.com/report'] }).success).toBe(true);
  });
});
