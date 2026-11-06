import '../config/load-env';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Smoke check rilis Modul 3 (M3_TASK_006 §E). Tidak mencetak secret.
 *
 *   npm run m3:smoke
 *
 * Cek: (1) Dashboard /health, (2) MCP dengan MCP_INTEL_API_KEY hanya mengekspos tool `intel_*`,
 * (3) intel_sources_status → route LLM Gateway tersedia (Gateway diperiksa MCP memakai key `system`).
 */
const TIMEOUT_MS = 15_000;

type Check = { name: string; ok: boolean; detail: string };

async function dashboard(): Promise<Check> {
  // backend bisa mendengarkan IPv4 saja atau IPv6 saja (`::`), jadi coba beberapa host
  const port = process.env.PORT ?? 3000;
  const urls = process.env.API_BASE_URL
    ? [`${process.env.API_BASE_URL.replace(/\/api\/v1\/?$/, '')}/health`]
    : [`http://127.0.0.1:${port}/health`, `http://[::1]:${port}/health`];
  let last = '';
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      return { name: 'Dashboard /health', ok: res.ok, detail: `HTTP ${res.status} (${url})` };
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      last = `${(error as Error).message}${cause ? ` ${cause}` : ''} (${url})`;
    }
  }
  return { name: 'Dashboard /health', ok: false, detail: last };
}

async function mcp(): Promise<Check[]> {
  const key = process.env.MCP_INTEL_API_KEY;
  const url = process.env.MCP_SERVER_URL;
  if (!key || !url) return [{ name: 'MCP intel', ok: false, detail: 'MCP_INTEL_API_KEY / MCP_SERVER_URL belum diisi' }];
  const client = new Client({ name: 'dashboard-m3-smoke', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
  try {
    await client.connect(transport, { timeout: TIMEOUT_MS });
    const { tools } = await client.listTools(undefined, { timeout: TIMEOUT_MS });
    const names = tools.map((t) => t.name);
    const foreign = names.filter((n) => !n.startsWith('intel_'));
    const status = await client.callTool({ name: 'intel_sources_status', arguments: { refresh: false } }, undefined, { timeout: TIMEOUT_MS });
    const routes = ((status.structuredContent as { llm?: { routes?: { route: string; available: boolean }[] } })?.llm?.routes ?? []);
    const down = routes.filter((r) => !r.available).map((r) => r.route);
    return [
      { name: 'MCP tools/list hanya intel_*', ok: names.length > 0 && foreign.length === 0, detail: foreign.length ? `tool lain: ${foreign.join(', ')}` : `${names.length} tool intel` },
      { name: 'Route LLM Gateway', ok: routes.length > 0 && down.length === 0, detail: down.length ? `tidak tersedia: ${down.join(', ')}` : routes.map((r) => r.route).join(', ') },
    ];
  } catch (error) {
    return [{ name: 'MCP intel', ok: false, detail: (error as Error).message }];
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const checks = [await dashboard(), ...(await mcp())];
  for (const c of checks) process.stdout.write(`${c.ok ? 'OK  ' : 'GAGAL'} ${c.name} — ${c.detail}\n`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

void main();
