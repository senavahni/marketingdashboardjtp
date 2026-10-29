import '../config/load-env';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { signMcpPayload } from '../utils/helpers/crypto.util';

/**
 * Dev tool (TASK_009): kirim webhook MCP bertanda tangan ke Dashboard.
 *
 *   npm run mcp:send-event -- <event_type> --run <run_id> --agent <agent_id> [--task <task_id>]
 *        [--data '<json>' | --file payload.json] [--event-id <uuid>] [--bad-signature] [--old-timestamp]
 *
 * Contoh:
 *   npm run mcp:send-event -- agent.task.started --run <id> --agent <id>
 *   npm run mcp:send-event -- agent.comment.added --run <id> --agent <id> --data '{"content":"Halo!"}'
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const eventType = process.argv[2];
  const runId = arg('run');
  const agentId = arg('agent');
  if (!eventType || eventType.startsWith('--') || !runId || !agentId) {
    throw new Error('Pemakaian: mcp:send-event -- <event_type> --run <run_id> --agent <agent_id> [--task <task_id>] [--data <json>|--file <path>]');
  }
  const secret = process.env.MCP_WEBHOOK_SECRET;
  if (!secret) throw new Error('MCP_WEBHOOK_SECRET belum diisi');

  const dataRaw = arg('file') ? readFileSync(arg('file') as string, 'utf8') : (arg('data') ?? '{}');
  const body = JSON.stringify({
    contract_version: '1.0',
    event_id: arg('event-id') ?? randomUUID(),
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    run_id: runId,
    agent_id: agentId,
    task_id: arg('task') ?? null,
    data: JSON.parse(dataRaw),
  });
  const ts = String(Math.floor(Date.now() / 1000) - (flag('old-timestamp') ? 3600 : 0));
  const signature = flag('bad-signature') ? 'sha256=deadbeef' : signMcpPayload(secret, ts, body);
  const base = arg('url') ?? `${(process.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/api/v1`;

  const res = await fetch(`${base}/webhooks/mcp/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-MCP-Timestamp': ts, 'X-MCP-Signature': signature },
    body,
  });
  // eslint-disable-next-line no-console
  console.log(res.status, await res.text());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message ?? err);
  process.exit(1);
});
