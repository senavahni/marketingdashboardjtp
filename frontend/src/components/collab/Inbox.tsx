import { Inbox as InboxIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMarkRead, useNotifications, useUnreadCount } from '../../hooks/queries';
import { cn, timeAgo } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { Popover } from '../ui/popover';

/** Inbox notifikasi (lonceng) — unread count real-time via RealtimeBridge. */
export function Inbox() {
  const [open, setOpen] = useState(false);
  const { data: count } = useUnreadCount();
  const { data } = useNotifications();
  const mark = useMarkRead();
  const navigate = useNavigate();
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-96 p-0"
      trigger={
        <button className="flex w-full items-center gap-2 rounded px-2 py-1 text-[14px] text-ink-soft hover:bg-hover">
          <InboxIcon size={16} /> Inbox
          {!!count && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{count}</span>}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-medium">Inbox</span>
        <button className="text-[12px] text-accent hover:underline" onClick={() => mark.mutate('all')}>
          Tandai semua dibaca
        </button>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        {data?.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              if (!n.read_at) mark.mutate(n.id);
              if (n.url) navigate(n.url.replace(/\/t\/([^/]+)$/, '?p=$1'));
              setOpen(false);
            }}
            className={cn('flex w-full gap-2.5 border-b border-line px-3 py-2.5 text-left hover:bg-hover', !n.read_at && 'bg-sky-50/50')}
          >
            <ActorAvatar type={n.actor?.type ?? 'system'} name={n.actor?.name} size={24} />
            <div className="min-w-0 flex-1">
              <div className={cn('text-[13px]', !n.read_at && 'font-semibold')}>{n.title}</div>
              {n.body && <div className="truncate text-[12px] text-ink-soft">{n.body}</div>}
              <div className="text-[11px] text-ink-faint">{timeAgo(n.created_at)}</div>
            </div>
            {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
          </button>
        ))}
        {!data?.length && <div className="px-3 py-8 text-center text-[13px] text-ink-faint">Tidak ada notifikasi</div>}
      </div>
    </Popover>
  );
}
