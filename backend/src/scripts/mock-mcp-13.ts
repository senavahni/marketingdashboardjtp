/**
 * Mock MCP kontrak 1.3 (DSH-V1-02, pola M3 "mock MCP intel"): server MCP Streamable HTTP stateless + endpoint
 * HTTP `POST /uploads` & `GET /exports/:id`, berbasis fixture bersama `contracts/1.3/`. Input tool divalidasi
 * dengan schema kontrak (ketat seperti MCP asli); output = fixture valid yang disesuaikan dengan input.
 *
 * Dev:  npm run mcp:mock   (port MOCK_MCP_PORT, default 4100; key = MCP_INTEL_API_KEY)
 * Test: startMockMcp13({ apiKey, mode: 'drift' }) → respons sengaja melanggar kontrak.
 */
import '../config/load-env';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ZodType } from 'zod';
import {
  jobCreate13InputSchema,
  jobEstimate13InputSchema,
  jobResumeInputSchema,
  jobReviewInputSchema,
  LIMITS_13,
} from '../shared/schemas/intel-1.3.schema';
import {
  ciCompanyGetInputSchema,
  ciCompanyListInputSchema,
  ciGeoClustersInputSchema,
  ctBatchGetInputSchema,
  dataExportInputSchema,
  knAssetListInputSchema,
  McpTool13,
  miKpisInputSchema,
  oppExplainInputSchema,
  oppListInputSchema,
} from '../shared/schemas/intel-1.3-tools.schema';
import { jobRefInputSchema } from '../shared/schemas/intel.schema';

export interface MockMcp13Options {
  apiKey: string;
  port?: number;
  /** `drift` = semua output tool sengaja tidak sesuai kontrak (uji penolakan klien). */
  mode?: 'normal' | 'drift';
}

export interface MockMcp13 {
  url: string;
  close(): Promise<void>;
  /** Byte terbesar yang pernah ditahan di memori sekaligus oleh handler upload (uji tanpa buffer penuh). */
  stats: { uploads: number; maxChunkBytes: number; calls: { tool: string; args: Record<string, unknown> }[] };
}

const FIXTURES = resolve(__dirname, '../../../contracts/1.3/fixtures');
const fixture = (name: string): Record<string, unknown> =>
  (JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as { payload: Record<string, unknown> }).payload;

const UPLOAD_LIMITS: Record<string, number> = { pdf: LIMITS_13.pdfMaxBytes, xlsx: LIMITS_13.sheetMaxBytes, csv: LIMITS_13.sheetMaxBytes };

interface ToolDef {
  input: ZodType;
  output: (args: Record<string, unknown>, jobs: Map<string, { dashboardJobId: string; kind: string }>) => Record<string, unknown>;
}

const mcpId = (prefix: string) => `${prefix}_${randomBytes(5).toString('hex')}`;

const TOOLS: Record<McpTool13, ToolDef> = {
  intel_job_estimate: {
    input: jobEstimate13InputSchema,
    output: (args) => ({ ...fixture('valid_estimate'), kind: (args.spec as { kind: string }).kind }),
  },
  intel_job_create: {
    input: jobCreate13InputSchema,
    output: (args, jobs) => {
      const kind = (args.spec as { kind: string }).kind;
      const id = `j_${randomBytes(5).toString('hex')}`;
      jobs.set(id, { dashboardJobId: String(args.dashboard_job_id), kind });
      return { accepted: true, mcp_job_id: id, kind, estimate: { ...fixture('valid_estimate'), kind } };
    },
  },
  intel_job_get: {
    input: jobRefInputSchema,
    output: (args, jobs) => {
      const job = jobs.get(String(args.mcp_job_id));
      return { ...fixture('valid_job_view_awaiting_review'), mcp_job_id: args.mcp_job_id, dashboard_job_id: job?.dashboardJobId, kind: job?.kind ?? 'company_discovery' };
    },
  },
  intel_job_cancel: { input: jobRefInputSchema, output: () => ({ cancelled: true, status: 'cancelling' }) },
  intel_job_review: { input: jobReviewInputSchema, output: () => fixture('valid_review_output') },
  intel_job_resume: { input: jobResumeInputSchema, output: () => fixture('valid_resume_output') },
  mi_kpis: { input: miKpisInputSchema, output: () => fixture('valid_mi_kpis') },
  ci_company_list: { input: ciCompanyListInputSchema, output: () => fixture('valid_ci_company_list') },
  ci_company_get: { input: ciCompanyGetInputSchema, output: (args) => ({ ...fixture('valid_company_profile'), company_id: args.company_id }) },
  ci_geo_clusters: { input: ciGeoClustersInputSchema, output: () => fixture('valid_geo_clusters') },
  opp_list: { input: oppListInputSchema, output: () => fixture('valid_opp_list') },
  opp_explain: { input: oppExplainInputSchema, output: () => fixture('valid_opp_explain') },
  ct_batch_get: { input: ctBatchGetInputSchema, output: (args) => ({ ...fixture('valid_ct_batch'), batch_id: args.batch_id }) },
  kn_asset_list: { input: knAssetListInputSchema, output: () => fixture('valid_kn_asset_list') },
  data_export: {
    input: dataExportInputSchema,
    output: () => {
      const id = mcpId('ex');
      return { ...fixture('valid_data_export'), export_id: id, download_path: `/exports/${id}` };
    },
  },
};

function toolResult(payload: Record<string, unknown>, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload, isError };
}

function buildMcpServer(opts: MockMcp13Options, stats: MockMcp13['stats'], jobs: Map<string, { dashboardJobId: string; kind: string }>): Server {
  const server = new Server({ name: 'mock-mcp-1.3', version: '1.3.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.keys(TOOLS).map((name) => ({ name, inputSchema: { type: 'object' as const } })),
  }));
  server.setRequestHandler(CallToolRequestSchema, (req) => {
    const tool = TOOLS[req.params.name as McpTool13];
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    stats.calls.push({ tool: req.params.name, args });
    if (!tool) return toolResult({ code: 'NOT_FOUND', message: `tool ${req.params.name} tidak ada`, retryable: false }, true);
    const parsed = tool.input.safeParse(args);
    if (!parsed.success) {
      return toolResult({ code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), retryable: false }, true);
    }
    if (opts.mode === 'drift') return toolResult({ unexpected: true, status: 'teleported' });
    return toolResult(tool.output(args, jobs));
  });
  return server;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

/** Upload stream: hitung byte & SHA-256 per chunk, tolak saat melewati batas — tidak pernah menahan file utuh. */
function handleUpload(req: IncomingMessage, res: ServerResponse, stats: MockMcp13['stats']): void {
  const kind = String(req.headers['x-upload-kind'] ?? '');
  const filename = decodeURIComponent(String(req.headers['x-filename'] ?? 'file')).slice(0, 255);
  const limit = UPLOAD_LIMITS[kind];
  if (!limit) {
    sendJson(res, 415, { code: 'UNSUPPORTED_FILE', message: 'jenis file tidak didukung', retryable: false });
    req.resume();
    return;
  }
  const hash = createHash('sha256');
  let size = 0;
  let rejected = false;
  req.on('data', (chunk: Buffer) => {
    if (rejected) return;
    stats.maxChunkBytes = Math.max(stats.maxChunkBytes, chunk.length);
    size += chunk.length;
    if (size > limit) {
      rejected = true;
      sendJson(res, 413, { code: 'UPLOAD_TOO_LARGE', message: 'file melebihi batas', retryable: false });
      req.destroy();
      return;
    }
    hash.update(chunk);
  });
  req.on('end', () => {
    if (rejected) return;
    stats.uploads += 1;
    sendJson(res, 201, { upload_id: mcpId('u'), kind, filename, size, sha256: hash.digest('hex'), status: 'stored' });
  });
}

export async function startMockMcp13(opts: MockMcp13Options): Promise<MockMcp13> {
  const stats: MockMcp13['stats'] = { uploads: 0, maxChunkBytes: 0, calls: [] };
  const jobs = new Map<string, { dashboardJobId: string; kind: string }>();
  const http: HttpServer = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${opts.apiKey}`) {
      sendJson(res, 401, { code: 'UNAUTHENTICATED', message: 'key tidak valid', retryable: false });
      req.resume();
      return;
    }
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'POST' && path === '/uploads') return handleUpload(req, res, stats);
    if (req.method === 'GET' && /^\/exports\/[a-z]{1,4}_[0-9a-z]{10}$/.test(path)) {
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' }).end('name,org_type\n"SMK Negeri 1 Bandung",education\n');
      return;
    }
    if (path === '/mcp') {
      const server = buildMcpServer(opts, stats, jobs);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      void server.connect(transport).then(() => transport.handleRequest(req, res));
      return;
    }
    sendJson(res, 404, { code: 'NOT_FOUND', message: 'tidak ada', retryable: false });
    req.resume();
  });
  await new Promise<void>((done) => http.listen(opts.port ?? 0, '127.0.0.1', done));
  const { port } = http.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    stats,
    close: () => new Promise<void>((done) => http.close(() => done())),
  };
}

if (require.main === module) {
  const apiKey = process.env.MCP_INTEL_API_KEY;
  if (!apiKey) throw new Error('MCP_INTEL_API_KEY wajib diisi untuk mock MCP');
  void startMockMcp13({ apiKey, port: Number(process.env.MOCK_MCP_PORT ?? 4100) }).then((mock) => {
    process.stdout.write(`Mock MCP 1.3 berjalan di ${mock.url}/mcp (uploads: ${mock.url}/uploads)\n`);
  });
}
