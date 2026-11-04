/**
 * Parser markdown minimal & aman untuk ringkasan insight (M3_TASK_005): heading, bullet, daftar bernomor,
 * paragraf, **tebal**, dan tautan [teks](url) http/https. Tidak pernah menghasilkan HTML mentah —
 * keluaran berupa token yang dirender React sebagai teks (otomatis di-escape).
 */

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; text: string; href: string };

export type MdBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'paragraph'; inline: Inline[] };

/** URL hanya boleh http/https (menolak javascript:, data:, dll.). */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const INLINE_RE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else {
      const href = safeHref(m[3]);
      out.push(href ? { kind: 'link', text: m[2], href } : { kind: 'text', text: m[2] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = HEADING_RE.exec(line);
    const bullet = BULLET_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);
    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({
        kind: 'heading',
        level: Math.min(4, Math.max(2, heading[1].length + 1)) as 2 | 3 | 4,
        inline: parseInline(heading[2]),
      });
    } else if (bullet || ordered) {
      flush();
      const isOrdered = !bullet;
      const item = parseInline((bullet ?? ordered)![1]);
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === 'list' && prev.ordered === isOrdered) blocks[blocks.length - 1] = { ...prev, items: [...prev.items, item] };
      else blocks.push({ kind: 'list', ordered: isOrdered, items: [item] });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** Teks polos (untuk PDF/XLSX). */
export const inlineText = (inline: Inline[]) => inline.map((i) => i.text).join('');
