import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// M3_TASK_006 §D: tidak ada key LLM Gateway / OpenAI di source Dashboard (key hanya di MCP & Gateway)

const ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['backend/src', 'backend/test', 'frontend/src', 'frontend/e2e'];
const SKIP = /node_modules|generated|\.results|dist/;
const PATTERNS: [string, RegExp][] = [
  ['key LLM Gateway lengkap', /lgw_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{20,}/],
  ['key OpenAI', /\bsk-(proj-)?[A-Za-z0-9]{20,}/],
  ['OPENAI_API_KEY berisi nilai', /OPENAI_API_KEY\s*[:=]\s*['"][^'"\s]{8,}/],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (SKIP.test(path)) return [];
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|js|json)$/.test(name) ? [path] : [];
  });
}

describe('secret scan', () => {
  it('source & test Dashboard tidak memuat key lengkap', () => {
    const hits = SCAN_DIRS.flatMap((d) => files(join(ROOT, d))).flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      // fixture uji redaksi sengaja membuat key palsu lewat 'x'.repeat — bukan literal
      return PATTERNS.filter(([, re]) => re.test(text)).map(([label]) => `${relative(ROOT, path)}: ${label}`);
    });
    expect(hits).toEqual([]);
  });
});
