import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { PAUSE_META } from '../lib/mi-format';
import type {
  Approval,
  CfStatus,
  CfTarget,
  CfTargetList,
  CursorPage,
  Doctrine,
  DoctrineRole,
  Estimate13,
  ImportBatch,
  ImportBatchDetail,
  ImportRow,
  Job13,
  JobKind,
  KgGraph,
  KgNeighbors,
  KnAsset,
  KnowledgeCard,
  PauseReason,
  Playbook,
  PlaybookSummary,
  ReviewSubject,
  RollbackImpact,
  SearchResult,
  UploadProfile,
  UploadPurpose,
  UploadRef,
} from '../lib/mi-types';
import { getSocket, useRealtimeRoom } from '../lib/realtime';
import type { Page } from '../lib/types';

/** Query Market Intelligence v1.0.0. staleTime mengikuti TTL backend (§G); data ber-Socket.IO tidak di-poll. */
export const miKeys = {
  all: ['mi'] as const,
  jobs: (ws: string) => ['mi', 'jobs', ws] as const,
  job: (id: string) => ['mi', 'job', id] as const,
  approvals: (ws: string) => ['mi', 'approvals', ws] as const,
  uploads: (ws: string) => ['mi', 'uploads', ws] as const,
  imports: (ws: string) => ['mi', 'imports', ws] as const,
  targets: (ws: string) => ['mi', 'targets', ws] as const,
  kn: (ws: string) => ['mi', 'kn', ws] as const,
};

export interface JobSpecInput {
  kind: JobKind;
  title: string;
  llm_assist: boolean;
  budget_usd: number | null;
  params: Record<string, unknown>;
}

// ---------------------------------------------------------------- job 1.3
export const useJobs13 = (ws: string, kind: JobKind | 'all' = 'all') =>
  useQuery({ queryKey: [...miKeys.jobs(ws), kind], queryFn: () => api<Page<Job13>>(`/workspaces/${ws}/intel/jobs`, { query: { kind, limit: 50 } }), retry: false });

export const useJob13 = (id: string | undefined) =>
  useQuery({ queryKey: miKeys.job(id ?? ''), enabled: !!id, queryFn: () => api<Job13>(`/intel/jobs/${id}`), retry: false });

export const useEstimate13 = (ws: string) => useMutation({ mutationFn: (spec: JobSpecInput) => api<Estimate13>(`/workspaces/${ws}/intel/jobs/estimate`, { method: 'POST', body: { spec } }) });

export function useCreateJob13(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { spec: JobSpecInput; confirm_cost: boolean }) => api<Job13>(`/workspaces/${ws}/intel/jobs`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: miKeys.jobs(ws) }),
  });
}

export function useJob13Actions(ws: string, jobId: string) {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: miKeys.job(jobId) }), qc.invalidateQueries({ queryKey: miKeys.jobs(ws) }), qc.invalidateQueries({ queryKey: miKeys.approvals(ws) })]);
  return {
    resume: useMutation({ mutationFn: () => api<Job13>(`/workspaces/${ws}/intel/jobs/${jobId}/resume`, { method: 'POST' }), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: () => api(`/intel/jobs/${jobId}/cancel`, { method: 'POST' }), onSuccess: refresh }),
  };
}

// ---------------------------------------------------------------- approval
export const useApprovals = (ws: string, status: Approval['status'] = 'pending', subject?: ReviewSubject) =>
  useQuery({
    queryKey: [...miKeys.approvals(ws), status, subject],
    queryFn: () => api<Page<Approval>>(`/workspaces/${ws}/approvals`, { query: { status, subject_type: subject, limit: 100 } }),
    retry: false,
  });

/** Lencana sidebar: approval pending yang dapat diputuskan peran ini. */
export function usePendingApprovalCount(ws: string, enabled: boolean): number {
  const { data } = useQuery({
    queryKey: [...miKeys.approvals(ws), 'pending', undefined],
    queryFn: () => api<Page<Approval>>(`/workspaces/${ws}/approvals`, { query: { status: 'pending', limit: 100 } }),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  return data?.data.filter((a) => a.can_decide).length ?? 0;
}

export function useDecideApproval(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; decision: 'approve' | 'reject' | 'revise'; comment?: string }) => api<Job13>(`/workspaces/${ws}/approvals/${id}/decision`, { method: 'POST', body }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: miKeys.approvals(ws) }), qc.invalidateQueries({ queryKey: miKeys.jobs(ws) })]),
  });
}

// ---------------------------------------------------------------- upload & import
export const useUploads = (ws: string, purpose: UploadPurpose) =>
  useQuery({ queryKey: [...miKeys.uploads(ws), purpose], queryFn: () => api<{ data: UploadRef[] }>(`/workspaces/${ws}/uploads`, { query: { purpose } }).then((r) => r.data) });

export const useUploadProfile = (ws: string, uploadId: string | null) =>
  useQuery({ queryKey: [...miKeys.uploads(ws), 'profile', uploadId], enabled: !!uploadId, queryFn: () => api<UploadProfile>(`/workspaces/${ws}/uploads/${uploadId}/profile`), retry: false, staleTime: Infinity });

export const useImportBatches = (ws: string) =>
  useQuery({ queryKey: [...miKeys.imports(ws), 'list'], queryFn: () => api<CursorPage<ImportBatch>>(`/workspaces/${ws}/ci/imports`, { query: { limit: 50 } }), retry: false });

export const useImportBatch = (ws: string, batchId: string | undefined) =>
  useQuery({ queryKey: [...miKeys.imports(ws), batchId], enabled: !!batchId, queryFn: () => api<ImportBatchDetail>(`/workspaces/${ws}/ci/imports/${batchId}`), retry: false });

export const useImportRows = (ws: string, batchId: string | undefined, status: 'review' | 'failed') =>
  useQuery({
    queryKey: [...miKeys.imports(ws), batchId, 'rows', status],
    enabled: !!batchId,
    queryFn: () => api<CursorPage<ImportRow>>(`/workspaces/${ws}/ci/imports/${batchId}/rows`, { query: { status, limit: 100 } }),
    retry: false,
  });

export function useImportMutations(ws: string, batchId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: miKeys.imports(ws) });
  return {
    decideRow: useMutation({
      mutationFn: ({ rowId, ...body }: { rowId: string; decision: 'merge' | 'new' | 'ignore'; company_id?: string }) =>
        api(`/workspaces/${ws}/ci/imports/${batchId}/rows/${rowId}/decision`, { method: 'POST', body }),
      onSuccess: refresh,
    }),
    rollback: useMutation({
      mutationFn: (body: { dry_run: boolean; confirm_filename?: string }) => api<RollbackImpact>(`/workspaces/${ws}/ci/imports/${batchId}/rollback`, { method: 'POST', body }),
      onSuccess: (_d, v) => (v.dry_run ? undefined : refresh()),
    }),
  };
}

export interface CfFilters {
  statuses?: CfStatus[];
  import_batch_id?: string;
}
export const useCfTargets = (ws: string, f: CfFilters) =>
  useQuery({ queryKey: [...miKeys.targets(ws), f], queryFn: () => api<CfTargetList>(`/workspaces/${ws}/ci/contact-targets`, { query: { statuses: f.statuses, import_batch_id: f.import_batch_id, limit: 200 } }), retry: false });

export function useUpdateTarget(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId, ...body }: { targetId: string } & Partial<Pick<CfTarget, 'priority' | 'hint'>> & { select_candidate_id?: string; rerun?: boolean }) =>
      api<CfTarget>(`/workspaces/${ws}/ci/contact-targets/${targetId}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: miKeys.targets(ws) }),
  });
}

// ---------------------------------------------------------------- knowledge
export const useKnAssets = (ws: string) =>
  useQuery({ queryKey: [...miKeys.kn(ws), 'assets'], queryFn: () => api<CursorPage<KnAsset>>(`/workspaces/${ws}/kn/assets`, { query: { limit: 200 } }), retry: false, staleTime: 60_000 });

export const useKnSearch = (ws: string, q: string) =>
  useQuery({ queryKey: [...miKeys.kn(ws), 'search', q], enabled: q.trim().length >= 2, queryFn: () => api<{ results: SearchResult[] }>(`/workspaces/${ws}/kn/search`, { query: { q } }), retry: false });

export interface CardFilters {
  status?: KnowledgeCard['status'];
  card_type?: KnowledgeCard['card_type'];
  role?: DoctrineRole;
  asset_id?: string;
}
export const useKnCards = (ws: string, f: CardFilters) =>
  useQuery({ queryKey: [...miKeys.kn(ws), 'cards', f], queryFn: () => api<CursorPage<KnowledgeCard>>(`/workspaces/${ws}/kn/cards`, { query: { ...f, limit: 200 } }), retry: false });

export const useDoctrine = (ws: string, role: DoctrineRole) =>
  useQuery({ queryKey: [...miKeys.kn(ws), 'doctrine', role], queryFn: () => api<Doctrine>(`/workspaces/${ws}/kn/doctrines/${role}`), retry: false });

export const usePlaybooks = (ws: string) =>
  useQuery({ queryKey: [...miKeys.kn(ws), 'playbooks'], queryFn: () => api<{ playbooks: PlaybookSummary[] }>(`/workspaces/${ws}/kn/playbooks`).then((r) => r.playbooks), retry: false });

export const usePlaybook = (ws: string, id: string | null) =>
  useQuery({ queryKey: [...miKeys.kn(ws), 'playbook', id], enabled: !!id, queryFn: () => api<Playbook>(`/workspaces/${ws}/kn/playbooks/${id}`), retry: false });

export const useKgGraph = (ws: string, q: string, types: string[]) =>
  useQuery({ queryKey: [...miKeys.kn(ws), 'kg', q, types], queryFn: () => api<KgGraph>(`/workspaces/${ws}/kg/graph`, { query: { q: q || undefined, types, limit: 500 } }), retry: false });

export const useKgNeighbors = (ws: string, nodeId: string | null) =>
  useQuery({ queryKey: [...miKeys.kn(ws), 'kg-node', nodeId], enabled: !!nodeId, queryFn: () => api<KgNeighbors>(`/workspaces/${ws}/kg/nodes/${nodeId}/neighbors`), retry: false });

export function useKnowledgeMutations(ws: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: miKeys.kn(ws) });
  return {
    decideCards: useMutation({ mutationFn: (body: { card_ids: string[]; decision: 'approve' | 'reject' }) => api(`/workspaces/${ws}/kn/cards/decisions`, { method: 'POST', body }), onSuccess: refresh }),
    updateCard: useMutation({
      mutationFn: ({ cardId, ...body }: { cardId: string; version: number; title?: string; body?: string; roles?: DoctrineRole[] }) => api<KnowledgeCard>(`/workspaces/${ws}/kn/cards/${cardId}`, { method: 'PATCH', body }),
      onSuccess: refresh,
    }),
    decideDoctrine: useMutation({
      mutationFn: ({ role, ...body }: { role: DoctrineRole; version: number; decision: 'approve' | 'reject' }) => api<Doctrine>(`/workspaces/${ws}/kn/doctrines/${role}/decision`, { method: 'POST', body }),
      onSuccess: refresh,
    }),
    savePlaybook: useMutation({ mutationFn: ({ id, ...body }: { id: string; base_version: number; yaml: string }) => api<Playbook>(`/workspaces/${ws}/kn/playbooks/${id}/versions`, { method: 'POST', body }), onSuccess: refresh }),
    runPlaybook: useMutation({ mutationFn: (id: string) => api(`/workspaces/${ws}/kn/playbooks/${id}/runs`, { method: 'POST' }), onSuccess: refresh }),
  };
}

// ---------------------------------------------------------------- realtime
interface MiEvent {
  job_id?: string;
  kind?: string | null;
  event_type?: string;
  data?: { reason?: PauseReason; message?: string; status?: string };
}

/** Event Socket.IO kontrak 1.3 (room workspace) → invalidasi cache + toast saat job dijeda. */
export function useMiRealtime(ws: string, enabled: boolean): void {
  const qc = useQueryClient();
  useRealtimeRoom('workspace', enabled ? ws : null);
  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    const invalidate = (...keys: (readonly unknown[])[]) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
    const handlers: Record<string, (p: MiEvent) => void> = {
      'intel.job.updated': (p) => {
        if (!p.kind) return; // job sosial Modul 3 ditangani useIntelRealtime
        invalidate(miKeys.jobs(ws), ...(p.job_id ? [miKeys.job(p.job_id)] : []));
      },
      'intel.job.paused': (p) => {
        const meta = p.data?.reason ? PAUSE_META[p.data.reason] : null;
        toast.warning(meta?.title ?? 'Job dijeda', { description: p.data?.message });
      },
      'approval.created': () => invalidate(miKeys.approvals(ws)),
      'ci.import.status': () => invalidate(miKeys.imports(ws), miKeys.targets(ws)),
      'kn.asset.status': () => invalidate(miKeys.kn(ws), miKeys.uploads(ws)),
      'intel.company.upserted': () => invalidate(miKeys.targets(ws)),
    };
    Object.entries(handlers).forEach(([e, h]) => s.on(e, h));
    return () => Object.entries(handlers).forEach(([e, h]) => s.off(e, h));
  }, [qc, ws, enabled]);
}
