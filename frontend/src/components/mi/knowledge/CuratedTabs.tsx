import { Check, Pencil, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useDoctrine, useKnCards, useKnowledgeMutations, usePlaybook, usePlaybooks, type CardFilters } from '../../../hooks/mi-queries';
import { ApiError, errorMessage } from '../../../lib/api';
import { CARD_TYPE_LABEL, ROLE_LABEL, lineDiff } from '../../../lib/mi-format';
import type { CardType, DoctrineRole, KnowledgeCard } from '../../../lib/mi-types';
import { cn, formatDateTime, timeAgo } from '../../../lib/utils';
import { Dialog } from '../../ui/dialog';
import { BookCitation, StatusPill } from '../badges';
import { StateView, stateFromError } from '../StateView';

const ROLES = Object.keys(ROLE_LABEL) as DoctrineRole[];
const select = 'h-8 rounded-lg border border-line-strong bg-white px-2 text-[13px]';
const notify = (ok: string) => ({ onSuccess: () => toast.success(ok), onError: (e: unknown) => toast.error(e instanceof ApiError && e.status === 409 ? 'Diubah orang lain — muat ulang lalu coba lagi' : errorMessage(e)) });

/** Knowledge card (§D.7): approve/edit/tolak; massal diizinkan (keputusan PO #4). Hanya kartu approved masuk doktrin. */
export function CardsTab({ ws, canApprove }: { ws: string; canApprove: boolean }) {
  const [f, setF] = useState<CardFilters>({ status: 'draft' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<KnowledgeCard | null>(null);
  const cards = useKnCards(ws, f);
  const m = useKnowledgeMutations(ws);
  const items = cards.data?.items ?? [];
  const decidable = items.filter((c) => c.status !== 'approved');
  const decide = (ids: string[], decision: 'approve' | 'reject') =>
    m.decideCards.mutate({ card_ids: ids, decision }, { ...notify(`${ids.length} kartu ${decision === 'approve' ? 'disetujui' : 'ditolak'}`), onSettled: () => setSelected(new Set()) });

  return (
    <div>
      <p className="mb-3 rounded-xl bg-[#F1F8F7] px-3 py-2 text-[13px] text-[#0B7A6E]">Hanya kartu berstatus <strong>approved</strong> yang masuk ke doktrin agent.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select aria-label="Status kartu" className={select} value={f.status ?? ''} onChange={(e) => setF({ ...f, status: (e.target.value || undefined) as CardFilters['status'] })}>
          <option value="">Semua status</option>
          <option value="draft">Draf</option>
          <option value="approved">Disetujui</option>
          <option value="rejected">Ditolak</option>
        </select>
        <select aria-label="Jenis kartu" className={select} value={f.card_type ?? ''} onChange={(e) => setF({ ...f, card_type: (e.target.value || undefined) as CardType | undefined })}>
          <option value="">Semua jenis</option>
          {Object.entries(CARD_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Peran" className={select} value={f.role ?? ''} onChange={(e) => setF({ ...f, role: (e.target.value || undefined) as DoctrineRole | undefined })}>
          <option value="">Semua peran</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        {canApprove && decidable.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-[13px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 accent-[#0E9384]" checked={selected.size > 0 && selected.size === decidable.length} onChange={(e) => setSelected(e.target.checked ? new Set(decidable.map((c) => c.card_id)) : new Set())} />
              Pilih semua ({decidable.length})
            </label>
            <button type="button" disabled={!selected.size || m.decideCards.isPending} onClick={() => decide([...selected], 'approve')} className="h-8 rounded-lg bg-[#0E9384] px-3 font-medium text-white disabled:opacity-40">
              Setujui terpilih
            </button>
            <button type="button" disabled={!selected.size || m.decideCards.isPending} onClick={() => decide([...selected], 'reject')} className="h-8 rounded-lg border border-[#F5C2B3] px-3 font-medium text-[#C2410C] disabled:opacity-40">
              Tolak terpilih
            </button>
          </div>
        )}
      </div>
      {cards.isLoading ? (
        <StateView kind="loading" />
      ) : cards.error ? (
        <StateView kind={stateFromError(cards.error)} error={cards.error} />
      ) : !items.length ? (
        <StateView kind="filtered-empty" title="Tidak ada kartu dengan filter ini" />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((c) => (
            <li key={c.card_id} className={cn('rounded-2xl border bg-white p-4', selected.has(c.card_id) ? 'border-[#0E9384]' : 'border-[#E3E7ED]')}>
              <div className="flex items-start gap-2">
                {canApprove && c.status !== 'approved' && (
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0E9384]" aria-label={`Pilih ${c.title}`} checked={selected.has(c.card_id)} onChange={(e) => setSelected((s) => (e.target.checked ? new Set(s).add(c.card_id) : new Set([...s].filter((x) => x !== c.card_id))))} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-[#0E9384] uppercase">{CARD_TYPE_LABEL[c.card_type]}</p>
                  <h3 className="text-[14px] font-semibold text-[#0F2340]">{c.title}</h3>
                </div>
                <StatusPill tone={c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'danger' : 'idle'} label={{ draft: 'Draf', approved: 'Disetujui', rejected: 'Ditolak' }[c.status]} />
              </div>
              <p className="mt-2 text-[13px] whitespace-pre-line text-ink">{c.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-soft">
                <BookCitation citation={{ asset_id: c.asset_id, book_title: c.book_title, page: c.page_from, chapter: c.page_to !== c.page_from ? `hlm. ${c.page_from}–${c.page_to}` : null }} />
                <span>Peran: {c.roles.map((r) => ROLE_LABEL[r]).join(', ') || '—'}</span>
                <span>v{c.version}</span>
              </div>
              {canApprove && (
                <div className="mt-3 flex gap-2">
                  {c.status !== 'approved' && (
                    <button type="button" onClick={() => decide([c.card_id], 'approve')} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#0E9384] px-2.5 text-[12px] font-medium text-white">
                      <Check size={12} /> Setujui
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing(c)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-line-strong px-2.5 text-[12px] font-medium">
                    <Pencil size={12} /> Edit
                  </button>
                  {c.status !== 'rejected' && (
                    <button type="button" onClick={() => decide([c.card_id], 'reject')} className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-[#C2410C] hover:bg-[#FDF1EC]">
                      <X size={12} /> Tolak
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <CardEditDialog card={editing} onClose={() => setEditing(null)} onSave={(body) => m.updateCard.mutate({ cardId: editing.card_id, version: editing.version, ...body }, { ...notify('Kartu disimpan sebagai versi baru (kembali ke draf)'), onSettled: () => setEditing(null) })} />}
    </div>
  );
}

function CardEditDialog({ card, onClose, onSave }: { card: KnowledgeCard; onClose: () => void; onSave: (b: { title: string; body: string; roles: DoctrineRole[] }) => void }) {
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body);
  const [roles, setRoles] = useState<DoctrineRole[]>(card.roles);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Edit knowledge card" description="Kartu yang diedit kembali ke draf dan perlu disetujui ulang." className="max-w-lg">
      <div className="space-y-3 text-[13px]">
        <label className="block">
          <span className="font-medium">Judul</span>
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line-strong px-3" />
        </label>
        <label className="block">
          <span className="font-medium">Isi</span>
          <textarea value={body} maxLength={2000} rows={6} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" />
        </label>
        <fieldset>
          <legend className="font-medium">Peran</legend>
          {ROLES.map((r) => (
            <label key={r} className="mr-3 inline-flex items-center gap-1">
              <input type="checkbox" className="accent-[#0E9384]" checked={roles.includes(r)} onChange={(e) => setRoles((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))} />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-ink-soft hover:bg-hover">
            Batal
          </button>
          <button type="button" disabled={!title.trim() || !body.trim()} onClick={() => onSave({ title: title.trim(), body: body.trim(), roles })} className="h-9 rounded-lg bg-[#0F2340] px-4 font-medium text-white disabled:opacity-40">
            Simpan
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Doktrin per peran (§D.7): aktif vs versi baru (diff) → approve satu per satu. */
export function DoctrineTab({ ws, canApprove }: { ws: string; canApprove: boolean }) {
  const [role, setRole] = useState<DoctrineRole>('creative');
  const doctrine = useDoctrine(ws, role);
  const m = useKnowledgeMutations(ws);
  const d = doctrine.data;
  const decide = (decision: 'approve' | 'reject') => d?.pending && m.decideDoctrine.mutate({ role, version: d.pending.version, decision }, notify(decision === 'approve' ? `Doktrin ${ROLE_LABEL[role]} v${d.pending.version} aktif` : 'Versi baru ditolak'));
  return (
    <div>
      <div role="radiogroup" aria-label="Peran" className="mb-4 flex gap-1">
        {ROLES.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={cn('rounded-full border px-3 py-1 text-[13px] font-medium', role === r ? 'border-[#0F2340] bg-[#0F2340] text-white' : 'border-line-strong bg-white')} lang="en">
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      {doctrine.isLoading ? (
        <StateView kind="loading" />
      ) : !d ? (
        <StateView kind={stateFromError(doctrine.error)} error={doctrine.error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
            <h3 className="text-[14px] font-semibold text-[#0F2340]">Doktrin aktif {d.active && `v${d.active.version}`}</h3>
            {d.active ? (
              <>
                <p className="text-[12px] text-ink-soft">
                  ≈{d.active.tokens} token · {d.active.card_ids.length} kartu · disetujui {d.active.approved_at ? formatDateTime(d.active.approved_at) : '—'}
                </p>
                <pre className="mt-2 font-sans text-[13px] whitespace-pre-wrap text-ink">{d.active.text}</pre>
              </>
            ) : (
              <p className="mt-2 text-[13px] text-ink-soft">Belum ada doktrin aktif — agent bekerja tanpa doktrin buku.</p>
            )}
          </section>
          <section className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
            <h3 className="text-[14px] font-semibold text-[#0F2340]">{d.pending ? `Versi baru v${d.pending.version} — menunggu persetujuan` : 'Tidak ada versi baru'}</h3>
            {d.pending && (
              <>
                <p className="text-[12px] text-ink-soft">≈{d.pending.tokens} token · dibuat {timeAgo(d.pending.created_at)}</p>
                <div className="mt-2 rounded-lg bg-[#F5F7FA] p-2 font-mono text-[12px]" aria-label="Perbandingan versi">
                  {lineDiff(d.active?.text ?? '', d.pending.text).map((l, i) => (
                    <div key={i} className={cn('whitespace-pre-wrap', l.kind === 'add' && 'bg-[#E6F4F2] text-[#0B7A6E]', l.kind === 'del' && 'bg-[#FDECE7] text-[#C2410C] line-through')}>
                      <span aria-hidden>{l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : '  '}</span>
                      <span className="sr-only">{l.kind === 'add' ? 'ditambah: ' : l.kind === 'del' ? 'dihapus: ' : ''}</span>
                      {l.text}
                    </div>
                  ))}
                </div>
                {canApprove ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={m.decideDoctrine.isPending} onClick={() => decide('approve')} className="h-8 rounded-lg bg-[#0E9384] px-3 text-[13px] font-medium text-white">
                      Setujui versi ini
                    </button>
                    <button type="button" disabled={m.decideDoctrine.isPending} onClick={() => decide('reject')} className="h-8 rounded-lg border border-[#F5C2B3] px-3 text-[13px] font-medium text-[#C2410C]">
                      Tolak
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-[12px] text-ink-faint">Butuh izin knowledge:approve untuk memutuskan.</p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Playbook (§D.7): daftar, YAML, riwayat versi, simpan = versi baru, jalankan, daftar run. */
export function PlaybooksTab({ ws, canEdit, canRun }: { ws: string; canEdit: boolean; canRun: boolean }) {
  const list = usePlaybooks(ws);
  const [id, setId] = useState<string | null>(null);
  const current = id ?? list.data?.[0]?.playbook_id ?? null;
  const pb = usePlaybook(ws, current);
  const m = useKnowledgeMutations(ws);
  const [yaml, setYaml] = useState('');
  useEffect(() => setYaml(pb.data?.yaml ?? ''), [pb.data?.yaml, pb.data?.version]);
  if (list.isLoading) return <StateView kind="loading" />;
  if (list.error) return <StateView kind={stateFromError(list.error)} error={list.error} />;
  if (!list.data?.length) return <StateView kind="empty" title="Belum ada playbook" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <ul className="space-y-1">
        {list.data.map((p) => (
          <li key={p.playbook_id}>
            <button type="button" aria-pressed={current === p.playbook_id} onClick={() => setId(p.playbook_id)} className={cn('w-full rounded-lg px-3 py-2 text-left text-[13px]', current === p.playbook_id ? 'bg-[#0F2340] text-white' : 'hover:bg-hover')}>
              <span className="block font-medium">{p.name}</span>
              <span className="text-[11px] opacity-75">
                {ROLE_LABEL[p.role]} · v{p.version}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {pb.isLoading || !pb.data ? (
        <StateView kind={pb.error ? stateFromError(pb.error) : 'loading'} error={pb.error} />
      ) : (
        <section className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-[#0F2340]">
              {pb.data.name} <span className="font-normal text-ink-soft">v{pb.data.version}</span>
            </h3>
            <div className="flex gap-2">
              {canEdit && (
                <button type="button" disabled={yaml === pb.data.yaml || m.savePlaybook.isPending} onClick={() => m.savePlaybook.mutate({ id: pb.data.playbook_id, base_version: pb.data.version, yaml }, notify('Disimpan sebagai versi baru'))} className="h-8 rounded-lg bg-[#0F2340] px-3 text-[13px] font-medium text-white disabled:opacity-40">
                  Simpan versi baru
                </button>
              )}
              {canRun && (
                <button type="button" disabled={m.runPlaybook.isPending} onClick={() => m.runPlaybook.mutate(pb.data.playbook_id, notify('Playbook dijalankan'))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-3 text-[13px] font-medium">
                  <Play size={13} /> Jalankan
                </button>
              )}
            </div>
          </div>
          <label htmlFor="pb-yaml" className="sr-only">
            YAML playbook
          </label>
          <textarea id="pb-yaml" value={yaml} readOnly={!canEdit} onChange={(e) => setYaml(e.target.value)} spellCheck={false} rows={14} className="w-full rounded-lg border border-line-strong bg-[#FBFCFD] p-3 font-mono text-[12px] outline-none focus:border-[#0E9384]" />
          <p className="mt-1 text-[11px] text-ink-faint">YAML divalidasi MCP saat disimpan; versi lama tetap tersimpan.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-[12px]">
            <div>
              <p className="mb-1 font-semibold text-[#0F2340]">Riwayat versi</p>
              <ul className="space-y-0.5 text-ink-soft">
                {pb.data.versions.map((v) => (
                  <li key={v.version}>
                    v{v.version} · {timeAgo(v.created_at)} {v.created_by && `· ${v.created_by}`}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-[#0F2340]">Run terakhir</p>
              <ul className="space-y-0.5 text-ink-soft">
                {pb.data.runs.length ? pb.data.runs.map((r) => <li key={r.run_id}>{r.status} · {timeAgo(r.started_at)}</li>) : <li>Belum pernah dijalankan</li>}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
