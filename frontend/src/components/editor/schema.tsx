import { BlockNoteSchema, createHeadingBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react';
import { Bot, Link2, Loader2, Play } from 'lucide-react';
import { useContext, useState } from 'react';
import { EditorAgentsContext } from './editor-context';

/** Mention @user / @agent — props sama dengan format backend (TASK_003 §Block format). */
export const Mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: { mention_type: { default: 'user' as 'user' | 'agent' }, id: { default: '' }, label: { default: '' } },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => {
      const agent = inlineContent.props.mention_type === 'agent';
      return (
        <span
          className={
            agent
              ? 'inline-flex items-center gap-0.5 rounded bg-agent-soft px-1 text-agent'
              : 'rounded bg-sky-50 px-1 text-sky-700'
          }
        >
          {agent && <Bot size={12} className="inline" />}@{inlineContent.props.label}
        </span>
      );
    },
  },
);

/** Embed link (bookmark) — URL diisi user, tidak mengambil metadata dari server lain (hindari SSRF). */
export const Bookmark = createReactBlockSpec(
  { type: 'bookmark', propSchema: { url: { default: '' }, title: { default: '' }, description: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => {
      const { url, title } = block.props;
      const [draft, setDraft] = useState(url);
      const safe = /^https?:\/\//i.test(url);
      if (!url && editor.isEditable) {
        return (
          <form
            className="flex w-full items-center gap-2 rounded-md border border-line-strong bg-stone-50 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^https?:\/\//i.test(draft)) editor.updateBlock(block, { props: { url: draft, title: draft.replace(/^https?:\/\//, '') } });
            }}
          >
            <Link2 size={16} className="text-ink-faint" />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tempel link (https://…) lalu Enter" className="flex-1 bg-transparent text-sm outline-none" />
          </form>
        );
      }
      return (
        <a
          href={safe ? url : undefined}
          target="_blank"
          rel="noopener noreferrer"
          contentEditable={false}
          className="flex w-full items-center gap-2 rounded-md border border-line-strong p-3 no-underline hover:bg-hover"
        >
          <Link2 size={16} className="shrink-0 text-ink-faint" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{title || url}</span>
            <span className="block truncate text-xs text-ink-faint">{url}</span>
          </span>
        </a>
      );
    },
  },
);

/** AI Prompt block (P1) — jalankan prompt ke agent, hasil ditulis agent di bawah blok ini. */
export const AiPrompt = createReactBlockSpec(
  {
    type: 'aiPrompt',
    propSchema: { prompt: { default: '' }, agent_id: { default: '' }, status: { default: 'idle' }, last_run_id: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const running = block.props.status === 'running';
      const agents = useContext(EditorAgentsContext);
      return (
        <div contentEditable={false} className="w-full rounded-md border border-agent/30 bg-agent-soft/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-agent">
            <Bot size={14} /> AI Prompt
            <span className="ml-auto font-normal text-ink-faint">{running ? 'Berjalan…' : block.props.status === 'completed' ? 'Selesai' : block.props.status === 'failed' ? 'Gagal' : ''}</span>
          </div>
          <textarea
            value={block.props.prompt}
            disabled={running || !editor.isEditable}
            onChange={(e) => editor.updateBlock(block, { props: { prompt: e.target.value } })}
            placeholder="Tulis instruksi untuk agent…"
            className="min-h-16 w-full resize-y rounded border border-line bg-white p-2 text-sm outline-none"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <select
              value={block.props.agent_id}
              disabled={running || !editor.isEditable}
              onChange={(e) => editor.updateBlock(block, { props: { agent_id: e.target.value } })}
              className="rounded border border-line bg-white px-1.5 py-1 text-xs"
            >
              <option value="">Pilih agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={running || !block.props.prompt.trim() || !block.props.agent_id}
              onClick={() => window.dispatchEvent(new CustomEvent('ai-prompt-run', { detail: { blockId: block.id } }))}
              className="inline-flex items-center gap-1 rounded bg-agent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Jalankan
            </button>
          </div>
        </div>
      );
    },
  },
);

const { paragraph, quote, bulletListItem, numberedListItem, checkListItem, toggleListItem, codeBlock, table, image, divider } = defaultBlockSpecs;

/**
 * Schema editor: hanya blok yang diizinkan backend (TASK_003). Audio/video/file dinonaktifkan;
 * gambar hanya via URL (tanpa uploadFile). Heading dibatasi H1–H3.
 */
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3] }),
    quote,
    bulletListItem,
    numberedListItem,
    checkListItem,
    toggleListItem,
    codeBlock,
    table,
    image,
    divider,
    bookmark: Bookmark(),
    aiPrompt: AiPrompt(), // item slash menu hanya muncul jika FEATURE_AI_PROMPT_BLOCK aktif
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
});

export type AppEditor = typeof schema.BlockNoteEditor;
export type AppBlock = typeof schema.Block;
