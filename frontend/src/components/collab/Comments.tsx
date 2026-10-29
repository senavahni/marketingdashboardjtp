import { Bot, CornerDownRight, Send, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchAssignees, useComments, useCreateComment, useDeleteComment } from '../../hooks/queries';
import { useAuth } from '../../lib/auth-store';
import type { Assignees, Comment } from '../../lib/types';
import { cn, formatDateTime, timeAgo } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { Spinner } from '../ui/misc';

interface Props {
  workspaceId: string;
  entityType: 'task' | 'project';
  entityId: string;
  canComment: boolean;
  canModerate: boolean;
  agentTyping?: string | null;
}

/** Thread komentar (1 level balasan) dengan mention @user/@agent. */
export function Comments({ workspaceId, entityType, entityId, canComment, canModerate, agentTyping }: Props) {
  const { data, isLoading } = useComments(entityType, entityId);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      {data?.map((c) => (
        <div key={c.id}>
          <CommentItem c={c} entityType={entityType} entityId={entityId} canModerate={canModerate} onReply={canComment ? () => setReplyTo(c.id) : undefined} />
          {!!c.replies?.length && (
            <div className="mt-2 ml-8 space-y-2 border-l border-line pl-3">
              {c.replies.map((r) => (
                <CommentItem key={r.id} c={r} entityType={entityType} entityId={entityId} canModerate={canModerate} />
              ))}
            </div>
          )}
          {replyTo === c.id && (
            <div className="mt-2 ml-8">
              <Composer workspaceId={workspaceId} entityType={entityType} entityId={entityId} parentId={c.id} autoFocus onDone={() => setReplyTo(null)} />
            </div>
          )}
        </div>
      ))}
      {!data?.length && <div className="text-[13px] text-ink-faint">Belum ada komentar.</div>}
      {agentTyping && (
        <div className="flex items-center gap-2 text-[12px] text-agent">
          <Bot size={14} /> {agentTyping} sedang mengetik
          <span className="dot-pulse">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
      )}
      {canComment && <Composer workspaceId={workspaceId} entityType={entityType} entityId={entityId} />}
    </div>
  );
}

function renderContent(c: Comment) {
  const names = c.mentions.map((m) => m.name).filter(Boolean) as string[];
  if (!names.length) return c.content;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  return c.content.split(re).map((part, i) => {
    const m = c.mentions.find((x) => `@${x.name}` === part);
    if (!m) return <span key={i}>{part}</span>;
    return (
      <span key={i} className={m.type === 'agent' ? 'rounded bg-agent-soft px-0.5 text-agent' : 'rounded bg-sky-50 px-0.5 text-sky-700'}>
        {part}
      </span>
    );
  });
}

function CommentItem({ c, entityType, entityId, canModerate, onReply }: { c: Comment; entityType: 'task' | 'project'; entityId: string; canModerate: boolean; onReply?: () => void }) {
  const me = useAuth((s) => s.user);
  const del = useDeleteComment(entityType, entityId);
  const mine = c.author.type === 'user' && c.author.id === me?.id;
  return (
    <div className="group flex gap-2.5">
      <ActorAvatar type={c.author.type} name={c.author.name} size={24} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="font-medium">{c.author.name ?? 'Sistem'}</span>
          {c.author.type === 'agent' && <span className="rounded bg-agent-soft px-1 text-[10px] font-semibold text-agent">AI</span>}
          <span className="text-[12px] text-ink-faint" title={formatDateTime(c.created_at)}>
            {timeAgo(c.created_at)}
            {c.edited_at && ' (diedit)'}
          </span>
          <span className="ml-auto hidden gap-1 group-hover:flex">
            {onReply && (
              <button onClick={onReply} className="rounded p-0.5 text-ink-faint hover:bg-hover" aria-label="Balas">
                <CornerDownRight size={13} />
              </button>
            )}
            {(mine || canModerate) && (
              <button onClick={() => confirm('Hapus komentar ini?') && del.mutate(c.id)} className="rounded p-0.5 text-ink-faint hover:bg-hover" aria-label="Hapus">
                <Trash2 size={13} />
              </button>
            )}
          </span>
        </div>
        <div className={cn('text-[14px] break-words whitespace-pre-wrap', c.author.type === 'system' && 'text-ink-soft italic')}>{renderContent(c)}</div>
      </div>
    </div>
  );
}

function Composer({
  workspaceId,
  entityType,
  entityId,
  parentId,
  autoFocus,
  onDone,
}: {
  workspaceId: string;
  entityType: 'task' | 'project';
  entityId: string;
  parentId?: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const create = useCreateComment(entityType, entityId);
  const user = useAuth((s) => s.user);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<{ type: 'user' | 'agent'; id: string; name: string }[]>([]);
  const [suggest, setSuggest] = useState<{ query: string; items: Assignees } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const options = suggest
    ? [...suggest.items.humans.map((h) => ({ type: 'user' as const, id: h.id, name: h.name })), ...suggest.items.agents.map((a) => ({ type: 'agent' as const, id: a.id, name: a.name }))]
    : [];

  const onInput = async (value: string) => {
    setText(value);
    const caret = ref.current?.selectionStart ?? value.length;
    const m = /(?:^|\s)@([\w.-]{0,30})$/.exec(value.slice(0, caret));
    if (!m) return setSuggest(null);
    const items = await fetchAssignees(workspaceId, m[1]).catch(() => null);
    if (items) {
      setSuggest({ query: m[1], items });
      setActive(0);
    }
  };

  const pick = (o: { type: 'user' | 'agent'; id: string; name: string }) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.-]{0,30})$/, `@${o.name} `);
    setText(before + text.slice(caret));
    setMentions((m) => (m.some((x) => x.id === o.id) ? m : [...m, o]));
    setSuggest(null);
    requestAnimationFrame(() => el?.focus());
  };

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    const used = mentions.filter((m) => content.includes(`@${m.name}`)).map(({ type, id }) => ({ type, id }));
    create.mutate(
      { content, mentions: used, parent_comment_id: parentId ?? null },
      {
        onSuccess: (res) => {
          setText('');
          setMentions([]);
          res.warnings?.forEach((w) => toast.warning(w.startsWith('AGENT_INACTIVE') ? `Agent ${w.split(':')[1]} tidak aktif` : 'Batas permintaan ke agent tercapai'));
          onDone?.();
        },
      },
    );
  };

  return (
    <div className="relative flex items-start gap-2.5">
      <ActorAvatar type="user" name={user?.display_name} size={24} className="mt-1" />
      <div className="flex-1 rounded-md border border-line-strong focus-within:border-accent">
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={text}
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          placeholder={parentId ? 'Balas…' : 'Tambahkan komentar… (ketik @ untuk mention orang atau agent)'}
          onChange={(e) => void onInput(e.target.value)}
          onKeyDown={(e) => {
            if (suggest && options.length) {
              if (e.key === 'ArrowDown') return (e.preventDefault(), setActive((a) => (a + 1) % options.length));
              if (e.key === 'ArrowUp') return (e.preventDefault(), setActive((a) => (a - 1 + options.length) % options.length));
              if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), pick(options[active]));
              if (e.key === 'Escape') return setSuggest(null);
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === 'Escape') onDone?.();
          }}
          className="block w-full resize-none bg-transparent px-2.5 py-1.5 text-[14px] outline-none"
        />
        {text.trim() && (
          <div className="flex justify-end px-1.5 pb-1.5">
            <button onClick={submit} disabled={create.isPending} className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[12px] font-medium text-white disabled:opacity-50">
              <Send size={12} /> Kirim <span className="opacity-70">Ctrl+↵</span>
            </button>
          </div>
        )}
      </div>
      {suggest && options.length > 0 && (
        <div className="absolute bottom-full left-8 z-30 mb-1 max-h-60 w-64 overflow-auto rounded-lg border border-line bg-white p-1 shadow-xl">
          {options.map((o, i) => (
            <button
              key={o.id}
              onMouseDown={(e) => (e.preventDefault(), pick(o))}
              className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]', i === active && 'bg-hover')}
            >
              <ActorAvatar type={o.type} name={o.name} />
              <span className="truncate">{o.name}</span>
              {o.type === 'agent' && <span className="ml-auto text-[10px] font-semibold text-agent">AI</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
