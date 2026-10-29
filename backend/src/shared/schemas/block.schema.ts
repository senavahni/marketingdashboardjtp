import { z } from 'zod';
import { isSafeUrl, stripControlChars } from '../../utils/helpers/text.util';

/**
 * Format blok mengikuti BlockNote (TASK_003 §Block format).
 * content_json = { props, content } — properti yang tidak dikenal dibuang (z.object default = strip).
 */

const color = z.string().max(32).regex(/^[a-zA-Z0-9#_-]*$/);
const alignment = z.enum(['left', 'center', 'right', 'justify']);
const cleanText = (max: number) => z.string().max(max).transform(stripControlChars);
const httpUrl = z.string().max(2048).refine((v) => v === '' || isSafeUrl(v), 'URL harus http:// atau https://');
const linkUrl = z.string().max(2048).refine((v) => isSafeUrl(v, true), 'Link harus http(s):// atau mailto:');

const styles = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    code: z.boolean().optional(),
    textColor: color.optional(),
    backgroundColor: color.optional(),
  })
  .default({});

export const styledText = z.object({ type: z.literal('text'), text: cleanText(10_000), styles });
const link = z.object({ type: z.literal('link'), href: linkUrl, content: z.array(styledText).max(200) });
export const mentionInline = z.object({
  type: z.literal('mention'),
  props: z.object({
    mention_type: z.enum(['user', 'agent']),
    id: z.uuid().transform((v) => v.toLowerCase()),
    label: cleanText(100).pipe(z.string().min(1)),
  }),
});
const inline = z.discriminatedUnion('type', [styledText, link, mentionInline]);
const inlineArray = z.array(inline).max(2000).default([]);
const textOnlyArray = z.array(styledText).max(2000).default([]);

const textProps = z.object({
  textColor: color.optional(),
  backgroundColor: color.optional(),
  textAlignment: alignment.optional(),
});

const tableCell = z.union([
  inlineArray,
  z.object({ type: z.literal('tableCell'), props: z.record(z.string(), z.unknown()).optional(), content: inlineArray }).transform((c) => ({
    type: 'tableCell' as const,
    props: {},
    content: c.content,
  })),
]);
const tableContent = z.object({
  type: z.literal('tableContent'),
  columnWidths: z.array(z.number().positive().max(4000).nullable()).max(20).optional(),
  rows: z.array(z.object({ cells: z.array(tableCell).max(20) })).max(50),
});

const withContent = <P extends z.ZodType, C extends z.ZodType>(props: P, content: C) =>
  z.object({ props: props.default({} as never), content });
const propsOnly = <P extends z.ZodType>(props: P) => z.object({ props: props.default({} as never) });

/** Schema content_json per block_type. */
export const BLOCK_SCHEMAS = {
  paragraph: withContent(textProps, inlineArray),
  heading: withContent(textProps.extend({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1) }), inlineArray),
  bulletListItem: withContent(textProps, inlineArray),
  numberedListItem: withContent(textProps.extend({ start: z.number().int().min(1).max(100000).optional() }), inlineArray),
  checkListItem: withContent(textProps.extend({ checked: z.boolean().default(false) }), inlineArray),
  quote: withContent(textProps, inlineArray),
  codeBlock: withContent(z.object({ language: z.string().max(32).regex(/^[a-zA-Z0-9+#._-]*$/).optional() }), textOnlyArray),
  table: withContent(z.object({ textColor: color.optional(), backgroundColor: color.optional() }), tableContent.optional()),
  image: propsOnly(
    z.object({
      url: httpUrl.default(''),
      caption: cleanText(1000).optional(),
      name: cleanText(255).optional(),
      previewWidth: z.number().positive().max(4000).optional(),
      showPreview: z.boolean().optional(),
      textAlignment: alignment.optional(),
      backgroundColor: color.optional(),
    }),
  ),
  divider: propsOnly(z.object({})),
  bookmark: propsOnly(
    z.object({
      url: httpUrl.pipe(z.string().min(1, 'URL bookmark wajib diisi')),
      title: cleanText(300).optional(),
      description: cleanText(1000).optional(),
    }),
  ),
  aiPrompt: propsOnly(
    z.object({
      prompt: cleanText(4000).default(''),
      agent_id: z.uuid().nullable().optional(),
      status: z.enum(['idle', 'running', 'completed', 'failed']).default('idle'),
      last_run_id: z.uuid().nullable().optional(),
    }),
  ),
} as const;

export type BlockType = keyof typeof BLOCK_SCHEMAS;
export const BLOCK_TYPES = Object.keys(BLOCK_SCHEMAS) as BlockType[];

export interface InlineText {
  type: 'text';
  text: string;
  styles?: Record<string, unknown>;
}
export interface InlineLink {
  type: 'link';
  href: string;
  content: InlineText[];
}
export interface InlineMention {
  type: 'mention';
  props: { mention_type: 'user' | 'agent'; id: string; label: string };
}
export type Inline = InlineText | InlineLink | InlineMention;

export interface BlockContent {
  props: Record<string, unknown>;
  content?: unknown;
}

export type BlockValidationResult = { ok: true; content: BlockContent } | { ok: false; issues: { path: string; message: string }[] };

export function isBlockType(value: string): value is BlockType {
  return Object.prototype.hasOwnProperty.call(BLOCK_SCHEMAS, value);
}

/** Validasi & bersihkan content_json untuk block_type tertentu. */
export function validateBlockContent(blockType: string, contentJson: unknown): BlockValidationResult {
  if (!isBlockType(blockType)) {
    return { ok: false, issues: [{ path: 'block_type', message: `block_type tidak dikenal: ${blockType}` }] };
  }
  const result = BLOCK_SCHEMAS[blockType].safeParse(contentJson ?? {});
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((i) => ({ path: `content_json.${i.path.join('.')}`, message: i.message })) };
  }
  return { ok: true, content: result.data as BlockContent };
}

function inlineToText(items: unknown): string {
  if (!Array.isArray(items)) return '';
  return (items as Inline[])
    .map((i) => {
      if (i.type === 'text') return i.text;
      if (i.type === 'link') return i.content.map((c) => c.text).join('');
      if (i.type === 'mention') return `@${i.props.label}`;
      return '';
    })
    .join('');
}

function tableRows(content: unknown): unknown[][] {
  const rows = (content as { rows?: { cells: unknown[] }[] } | undefined)?.rows ?? [];
  return rows.map((r) => r.cells.map((c) => (Array.isArray(c) ? c : (c as { content: unknown }).content)));
}

/** Teks polos untuk full-text search & task_description agent. */
export function extractPlainText(blockType: string, content: BlockContent): string {
  const p = content.props ?? {};
  switch (blockType) {
    case 'table':
      return tableRows(content.content)
        .map((cells) => cells.map(inlineToText).join(' | '))
        .join('\n');
    case 'image':
      return [p.caption, p.name].filter(Boolean).join(' ');
    case 'bookmark':
      return [p.title, p.description, p.url].filter(Boolean).join(' ');
    case 'aiPrompt':
      return String(p.prompt ?? '');
    case 'divider':
      return '';
    default:
      return inlineToText(content.content);
  }
}

function collectInline(content: BlockContent): unknown[] {
  if (Array.isArray(content.content)) return content.content;
  return tableRows(content.content).flat(2);
}

/** Daftar mention di dalam blok. */
export function extractMentions(content: BlockContent): { mention_type: 'user' | 'agent'; id: string }[] {
  return (collectInline(content) as Inline[])
    .filter((i): i is InlineMention => i?.type === 'mention')
    .map((m) => ({ mention_type: m.props.mention_type, id: m.props.id }));
}

/** Ganti mention yang tidak valid (bukan member/agent workspace) menjadi teks biasa "@label". */
export function replaceInvalidMentions(content: BlockContent, isValid: (m: InlineMention['props']) => boolean): BlockContent {
  const fix = (items: unknown): unknown =>
    Array.isArray(items)
      ? (items as Inline[]).map((i) =>
          i?.type === 'mention' && !isValid(i.props) ? { type: 'text', text: `@${i.props.label}`, styles: {} } : i,
        )
      : items;

  if (Array.isArray(content.content)) return { ...content, content: fix(content.content) };
  const table = content.content as { type?: string; rows?: { cells: unknown[] }[] } | undefined;
  if (table?.type === 'tableContent' && table.rows) {
    return {
      ...content,
      content: {
        ...table,
        rows: table.rows.map((r) => ({
          cells: r.cells.map((c) => (Array.isArray(c) ? fix(c) : { ...(c as object), content: fix((c as { content: unknown }).content) })),
        })),
      },
    };
  }
  return content;
}
