import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote, type DefaultReactSuggestionItem } from '@blocknote/react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, Link2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchAssignees, useAgents, useBlocks } from '../../hooks/queries';
import { api, CLIENT_ID, errorMessage } from '../../lib/api';
import { FEATURE_AI_PROMPT_BLOCK } from '../../lib/constants';
import { qk } from '../../lib/query-client';
import { getSocket } from '../../lib/realtime';
import type { Block } from '../../lib/types';
import { cn } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { Spinner } from '../ui/misc';
import { blockHash, diffDocument, flattenEditor, flattenServer, toEditorBlocks, type BatchOp, type EditorBlockLike, type Snapshot } from './adapters';
import { EditorAgentsContext } from './editor-context';
import { schema } from './schema';

interface Props {
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  readOnly?: boolean;
  placeholderTitle?: string;
}

/** Editor dokumen block-based (Task & Project Brief). */
export function BlockEditor(props: Props) {
  const { data, isLoading, error } = useBlocks(props.projectId, props.taskId);
  if (error) return <div className="py-4 text-sm text-red-600">{errorMessage(error)}</div>;
  if (isLoading || !data) {
    return (
      <div className="py-6">
        <Spinner />
      </div>
    );
  }
  return <EditorInner key={`${props.projectId}:${props.taskId ?? 'brief'}`} initial={data} {...props} />;
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
const DEBOUNCE_MS = 2000;
const MAX_WAIT_MS = 10_000;
const MAX_OPS_PER_REQUEST = 200;

function EditorInner({ initial, workspaceId, projectId, taskId, readOnly }: Props & { initial: Block[] }) {
  const qc = useQueryClient();
  const editor = useCreateBlockNote({ schema, initialContent: initial.length ? toEditorBlocks(initial) : undefined });
  const { data: agents } = useAgents(FEATURE_AI_PROMPT_BLOCK ? workspaceId : undefined);

  const snapshot = useRef(new Map<string, Snapshot>());
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const applyingRemote = useRef(false);
  const firstDirtyAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryDelay = useRef(2000);
  const needsReconcile = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const doc = () => editor.document as unknown as EditorBlockLike[];

  // Snapshot awal: hash dari dokumen editor (sudah dinormalisasi BlockNote) + versi dari server
  useEffect(() => {
    const versions = new Map(flattenServer(initial).map((b) => [b.id, b.version]));
    for (const fb of flattenEditor(doc())) {
      const v = versions.get(fb.id);
      if (v !== undefined) snapshot.current.set(fb.id, { hash: blockHash(fb), version: v });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncSnapshotFromServer = useCallback(
    (serverBlocks: Block[]) => {
      const versions = new Map(serverBlocks.map((b) => [b.id, b.version]));
      for (const fb of flattenEditor(doc())) {
        const v = versions.get(fb.id);
        if (v !== undefined) snapshot.current.set(fb.id, { hash: blockHash(fb), version: v });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Terapkan satu blok versi server ke editor tanpa memicu auto-save. */
  const applyServerBlock = useCallback(
    (b: Block) => {
      applyingRemote.current = true;
      try {
        if (editor.getBlock(b.id)) {
          editor.updateBlock(b.id, { type: b.block_type, props: b.content_json.props ?? {}, content: b.content_json.content } as never);
        }
      } finally {
        applyingRemote.current = false;
      }
    },
    [editor],
  );

  // ---------------- Auto-save ----------------
  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (readOnly || inFlight.current || !dirty.current) return;
    dirty.current = false;
    const { ops, hashes } = diffDocument(flattenEditor(doc()), snapshot.current);
    if (!ops.length) {
      setSaveState('saved');
      return;
    }
    inFlight.current = true;
    setSaveState('saving');
    try {
      for (let i = 0; i < ops.length; i += MAX_OPS_PER_REQUEST) {
        const chunk = ops.slice(i, i + MAX_OPS_PER_REQUEST);
        const res = await api<{ applied: { id: string; version: number }[]; conflicts: { id: string; server_block: Block | null }[] }>('/blocks/batch', {
          method: 'POST',
          body: { project_id: projectId, task_id: taskId, operations: chunk },
          keepalive: true,
        });
        const conflictIds = new Set(res.conflicts.map((c) => c.id));
        for (const a of res.applied) snapshot.current.set(a.id, { hash: hashes.get(a.id) ?? '', version: a.version });
        for (const op of chunk as BatchOp[]) if (op.op === 'delete' && !conflictIds.has(op.id)) snapshot.current.delete(op.id);
        for (const c of res.conflicts) {
          if (c.server_block) {
            applyServerBlock(c.server_block);
            syncSnapshotFromServer([c.server_block]);
          } else {
            snapshot.current.delete(c.id);
          }
        }
        if (res.conflicts.length) toast.info('Sebagian blok telah diubah pihak lain. Versi terbaru dimuat.');
      }
      retryDelay.current = 2000;
      setSaveState(dirty.current ? 'dirty' : 'saved');
    } catch (err) {
      dirty.current = true;
      setSaveState('error');
      const delay = retryDelay.current;
      retryDelay.current = Math.min(delay * 2, 30_000);
      timer.current = setTimeout(() => void flush(), delay);
      console.warn('Auto-save gagal', errorMessage(err));
    } finally {
      inFlight.current = false;
      if (dirty.current && saveStateRef.current !== 'error') schedule();
      if (needsReconcile.current) void reconcile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, taskId, readOnly]);

  const saveStateRef = useRef<SaveState>('saved');
  saveStateRef.current = saveState;

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    const now = Date.now();
    if (!firstDirtyAt.current) firstDirtyAt.current = now;
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, firstDirtyAt.current + MAX_WAIT_MS - now));
    timer.current = setTimeout(() => {
      firstDirtyAt.current = 0;
      void flush();
    }, wait);
  }, [flush]);

  const onChange = useCallback(() => {
    if (applyingRemote.current || readOnly) return;
    dirty.current = true;
    setSaveState('dirty');
    schedule();
  }, [readOnly, schedule]);

  // Flush saat tab disembunyikan / komponen dilepas; peringatan bila ada perubahan belum tersimpan
  useEffect(() => {
    const onVisibility = () => document.visibilityState === 'hidden' && void flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flush();
    };
  }, [flush]);

  // ---------------- Update remote (agent / user lain) ----------------
  const reconcile = useCallback(async () => {
    if (dirty.current || inFlight.current) {
      needsReconcile.current = true;
      if (!inFlight.current) void flush();
      return;
    }
    needsReconcile.current = false;
    const tree = await api<{ blocks: Block[] }>(taskId ? `/tasks/${taskId}/blocks` : `/projects/${projectId}/brief/blocks`).then((r) => r.blocks);
    qc.setQueryData(qk.blocks(projectId, taskId), tree);
    const serverFlat = flattenServer(tree);
    const serverById = new Map(serverFlat.map((b) => [b.id, b]));
    applyingRemote.current = true;
    try {
      const removed = [...snapshot.current.keys()].filter((id) => !serverById.has(id) && editor.getBlock(id));
      if (removed.length) editor.removeBlocks(removed);
      for (const id of [...snapshot.current.keys()]) if (!serverById.has(id)) snapshot.current.delete(id);

      for (const sb of serverFlat) {
        const partial = { type: sb.block_type, props: sb.content_json.props ?? {}, content: sb.content_json.content };
        if (editor.getBlock(sb.id)) {
          if ((snapshot.current.get(sb.id)?.version ?? 0) < sb.version) editor.updateBlock(sb.id, partial as never);
          continue;
        }
        const siblings = sb.parent_block_id ? (serverById.get(sb.parent_block_id)?.children ?? []) : tree;
        const idx = siblings.findIndex((x) => x.id === sb.id);
        const prev = [...siblings.slice(0, Math.max(0, idx))].reverse().find((x) => editor.getBlock(x.id));
        const toInsert = toEditorBlocks([sb]) as never[];
        if (prev) {
          editor.insertBlocks(toInsert, prev.id, 'after');
        } else if (sb.parent_block_id) {
          const parent = editor.getBlock(sb.parent_block_id);
          if (parent?.children.length) editor.insertBlocks(toInsert, parent.children[0].id, 'before');
          else if (parent) editor.updateBlock(parent.id, { children: toInsert } as never);
        } else {
          const first = editor.document[0];
          if (first) editor.insertBlocks(toInsert, first.id, 'before');
        }
      }
      syncSnapshotFromServer(serverFlat);
    } finally {
      applyingRemote.current = false;
    }
  }, [editor, flush, projectId, taskId, qc, syncSnapshotFromServer]);

  useEffect(() => {
    const s = getSocket();
    let t: ReturnType<typeof setTimeout> | undefined;
    const handler = (p: { project_id?: string; task_id?: string | null; origin_client_id?: string | null }) => {
      if (p.project_id !== projectId || (p.task_id ?? null) !== taskId || p.origin_client_id === CLIENT_ID) return;
      clearTimeout(t);
      t = setTimeout(() => void reconcile(), 250);
    };
    const events = ['block.upserted', 'block.deleted', 'blocks.reordered'];
    events.forEach((e) => s.on(e, handler));
    return () => {
      clearTimeout(t);
      events.forEach((e) => s.off(e, handler));
    };
  }, [projectId, taskId, reconcile]);

  // AI Prompt block → simpan dulu, lalu jalankan
  useEffect(() => {
    const onRun = async (e: Event) => {
      const blockId = (e as CustomEvent<{ blockId: string }>).detail.blockId;
      if (!editor.getBlock(blockId)) return;
      dirty.current = true;
      await flush();
      try {
        await api(`/blocks/${blockId}/run`, { method: 'POST' });
        toast.success('Prompt dikirim ke agent');
      } catch (err) {
        toast.error(errorMessage(err));
      }
    };
    window.addEventListener('ai-prompt-run', onRun);
    return () => window.removeEventListener('ai-prompt-run', onRun);
  }, [editor, flush]);

  // ---------------- Slash menu & mention ----------------
  const slashItems = useCallback(
    async (query: string) => {
      const custom: DefaultReactSuggestionItem[] = [
        {
          title: 'Embed link',
          subtext: 'Kartu link ke halaman web',
          aliases: ['bookmark', 'link', 'embed', 'tautan'],
          group: 'Media',
          icon: <Link2 size={18} />,
          onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'bookmark' } as never),
        },
      ];
      if (FEATURE_AI_PROMPT_BLOCK) {
        custom.push({
          title: 'AI Prompt',
          subtext: 'Minta agent menulis di dokumen ini',
          aliases: ['ai', 'agent', 'prompt'],
          group: 'AI',
          icon: <Bot size={18} />,
          onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'aiPrompt' } as never),
        });
      }
      return filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), ...custom], query);
    },
    [editor],
  );

  const mentionItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const res = await fetchAssignees(workspaceId, query).catch(() => ({ humans: [], agents: [] }));
      const insert = (mention_type: 'user' | 'agent', id: string, label: string) => () =>
        editor.insertInlineContent([{ type: 'mention', props: { mention_type, id, label } } as never, ' ']);
      return [
        ...res.humans.map((h) => ({ title: h.name, subtext: `@${h.username}`, group: 'Humans', icon: <ActorAvatar type="user" name={h.name} />, onItemClick: insert('user', h.id, h.name) })),
        ...res.agents.map((a) => ({ title: a.name, subtext: 'AI Agent', group: 'AI Agents', icon: <ActorAvatar type="agent" name={a.name} />, onItemClick: insert('agent', a.id, a.name) })),
      ];
    },
    [editor, workspaceId],
  );

  return (
    <EditorAgentsContext.Provider value={agents ?? []}>
      <div className="relative" onBlur={() => void flush()}>
        {!readOnly && (
          <div className="pointer-events-none absolute -top-6 right-0 text-[11px] text-ink-faint">
            <span className={cn(saveState === 'error' && 'pointer-events-auto text-red-600')}>
              {saveState === 'saving' && 'Menyimpan…'}
              {saveState === 'dirty' && 'Belum tersimpan'}
              {saveState === 'saved' && 'Tersimpan'}
              {saveState === 'error' && (
                <button type="button" className="underline" onClick={() => void flush()}>
                  Gagal menyimpan — coba lagi
                </button>
              )}
            </span>
          </div>
        )}
        <BlockNoteView editor={editor} editable={!readOnly} theme="light" slashMenu={false} onChange={onChange}>
          <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
          <SuggestionMenuController triggerCharacter="@" getItems={mentionItems} />
        </BlockNoteView>
      </div>
    </EditorAgentsContext.Provider>
  );
}
