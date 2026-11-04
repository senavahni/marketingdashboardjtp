import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, api } from '../lib/api';
import { applyJobUpdate } from '../lib/intel-format';
import type {
  Estimate,
  IntelAgent,
  IntelJob,
  ItemsPage,
  JobEvent,
  JobInput,
  JobStatus,
  JobUpdatedEvent,
  LlmStatus,
  SelectableStage,
  Sentiment,
  SourcesStatus,
  SourceType,
  StageDefaults,
} from '../lib/intel-types';
import { getSocket, useRealtimeRoom } from '../lib/realtime';
import type { Page } from '../lib/types';

const PAGE_SIZE = 30;
const ITEMS_PAGE = 50;
const POLL_MS = 15_000;
const OFFLINE_GRACE_MS = 30_000;

export interface JobFilters {
  status?: JobStatus;
  source?: SourceType;
}

export interface ItemFilters {
  source?: SourceType;
  sentiment?: Sentiment;
  q?: string;
  order_by: '-created_at' | 'created_at' | '-engagement';
}

export const intelKeys = {
  all: ['intel'] as const,
  agents: (ws: string) => ['intel', 'agents', ws] as const,
  stageDefaults: (ws: string) => ['intel', 'stage-defaults', ws] as const,
  llmStatus: (ws: string, days: number) => ['intel', 'llm-status', ws, days] as const,
  sources: (ws: string) => ['intel', 'sources', ws] as const,
  jobs: (ws: string) => ['intel', 'jobs', ws] as const,
  jobList: (ws: string, f: JobFilters) => ['intel', 'jobs', ws, f] as const,
  job: (id: string) => ['intel', 'job', id] as const,
  events: (id: string) => ['intel', 'events', id] as const,
  items: (id: string, f: ItemFilters) => ['intel', 'items', id, f] as const,
  estimate: (ws: string, input: JobInput | null) => ['intel', 'estimate', ws, input] as const,
};

/** Modul Intel nonaktif (MCP_INTEL_API_KEY kosong) → 503 FEATURE_DISABLED; UI cukup menyembunyikan fiturnya. */
export const isIntelDisabled = (err: unknown) => err instanceof ApiError && err.code === 'FEATURE_DISABLED';

/**
 * Apakah modul Intel aktif. Memakai endpoint stage-defaults (tidak memanggil MCP) sehingga murah
 * untuk dicek dari sidebar & tutorial.
 */
export function useIntelEnabled(ws: string): boolean | undefined {
  const { error, isLoading } = useStageDefaults(ws);
  if (isLoading) return undefined;
  return !isIntelDisabled(error);
}

export const useIntelAgents = (ws: string) =>
  useQuery({
    queryKey: intelKeys.agents(ws),
    queryFn: () => api<{ data: IntelAgent[] }>(`/workspaces/${ws}/intel/agents`).then((r) => r.data),
    retry: false,
  });

export const useStageDefaults = (ws: string) =>
  useQuery({
    queryKey: intelKeys.stageDefaults(ws),
    queryFn: () => api<{ data: StageDefaults }>(`/workspaces/${ws}/intel/stage-defaults`).then((r) => r.data),
    retry: false,
    staleTime: 5 * 60_000,
  });

export const useLlmStatus = (ws: string, days: 7 | 30) =>
  useQuery({
    queryKey: intelKeys.llmStatus(ws, days),
    queryFn: () => api<LlmStatus>(`/workspaces/${ws}/intel/llm-status`, { query: { range_days: days } }),
    retry: false,
  });

export const useUpdateStageDefaults = (ws: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Record<SelectableStage, string>>) => api(`/workspaces/${ws}/intel/stage-defaults`, { method: 'PUT', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: intelKeys.stageDefaults(ws) }),
  });
};

export const useIntelSources = (ws: string) =>
  useQuery({
    queryKey: intelKeys.sources(ws),
    queryFn: () => api<SourcesStatus>(`/workspaces/${ws}/intel/sources`),
    retry: false,
  });

export const useRefreshSources = (ws: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SourcesStatus>(`/workspaces/${ws}/intel/sources`, { query: { refresh: true } }),
    onSuccess: (data) => qc.setQueryData(intelKeys.sources(ws), data),
  });
};

export const useIntelJobs = (ws: string, filters: JobFilters) =>
  useInfiniteQuery({
    queryKey: intelKeys.jobList(ws, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<Page<IntelJob>>(`/workspaces/${ws}/intel/jobs`, { query: { limit: PAGE_SIZE, cursor: pageParam, ...filters } }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  });

export const useIntelJob = (id: string | undefined) =>
  useQuery({ queryKey: intelKeys.job(id ?? ''), enabled: !!id, queryFn: () => api<IntelJob>(`/intel/jobs/${id}`), retry: false });

export const useJobEvents = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: intelKeys.events(id),
    enabled,
    queryFn: () => api<{ data: JobEvent[] }>(`/intel/jobs/${id}/events`).then((r) => r.data),
  });

/**
 * Estimasi job. Kunci query = input lengkap → hasil selalu milik pilihan terakhir (tanpa race);
 * request lama dibatalkan lewat AbortSignal saat input berganti.
 */
export const useEstimate = (ws: string, input: JobInput | null) =>
  useQuery({
    queryKey: intelKeys.estimate(ws, input),
    enabled: !!input,
    queryFn: ({ signal }) => api<Estimate>(`/workspaces/${ws}/intel/jobs/estimate`, { method: 'POST', body: input, signal }),
    retry: false,
    staleTime: 60_000,
  });

export const useIntelItems = (jobId: string, filters: ItemFilters, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: intelKeys.items(jobId, filters),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<ItemsPage>(`/intel/jobs/${jobId}/items`, { query: { limit: ITEMS_PAGE, cursor: pageParam, ...filters }, signal }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  });

export function useCreateJob(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    onError: () => undefined, // ditampilkan di wizard
    mutationFn: (body: JobInput & { confirm_cost: boolean; retry_of_job_id?: string }) =>
      api<IntelJob>(`/workspaces/${ws}/intel/jobs`, { method: 'POST', body }),
    onSuccess: (job) => {
      qc.setQueryData(intelKeys.job(job.id), job);
      void qc.invalidateQueries({ queryKey: intelKeys.jobs(ws) });
    },
  });
}

export function useJobAction(ws: string, jobId: string) {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: intelKeys.job(jobId) });
    void qc.invalidateQueries({ queryKey: intelKeys.jobs(ws) });
  };
  return {
    cancel: useMutation({
      mutationFn: () => api<{ cancelled: boolean; status: JobStatus }>(`/intel/jobs/${jobId}/cancel`, { method: 'POST' }),
      onSuccess: settle,
    }),
    remove: useMutation({
      mutationFn: () => api(`/intel/jobs/${jobId}`, { method: 'DELETE' }),
      onSuccess: () => {
        qc.removeQueries({ queryKey: intelKeys.job(jobId) });
        void qc.invalidateQueries({ queryKey: intelKeys.jobs(ws) });
      },
    }),
    retryCreate: useMutation({
      mutationFn: () => api<IntelJob>(`/intel/jobs/${jobId}/retry-create`, { method: 'POST' }),
      onSuccess: settle,
    }),
  };
}

/**
 * Real-time job (M3_TASK_004): event `intel.job.updated` memperbarui cache daftar & detail; reconnect →
 * invalidate; bila socket terputus > 30 detik → polling 15 detik sampai tersambung lagi.
 */
export function useIntelRealtime(ws: string): void {
  const qc = useQueryClient();
  useRealtimeRoom('workspace', ws);
  useEffect(() => {
    const s = getSocket();
    const onUpdate = (ev: JobUpdatedEvent) => {
      qc.setQueriesData<InfiniteData<Page<IntelJob>>>({ queryKey: intelKeys.jobs(ws) }, (old) =>
        old ? { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.map((j) => applyJobUpdate(j, ev)) })) } : old,
      );
      const detail = qc.getQueryData<IntelJob>(intelKeys.job(ev.id));
      if (detail) {
        qc.setQueryData(intelKeys.job(ev.id), applyJobUpdate(detail, ev));
        // Status terminal → ambil hasil lengkap (insight, biaya aktual) dari API
        if (detail.status !== ev.status && !['queued', 'collecting', 'analyzing', 'indexing', 'cancelling'].includes(ev.status)) {
          void qc.invalidateQueries({ queryKey: intelKeys.job(ev.id) });
          void qc.invalidateQueries({ queryKey: intelKeys.events(ev.id) });
        }
      }
    };
    let offlineSince: number | null = s.connected ? null : Date.now();
    const onDisconnect = () => (offlineSince = Date.now());
    const onConnect = () => {
      if (offlineSince !== null) void qc.invalidateQueries({ queryKey: intelKeys.all });
      offlineSince = null;
    };
    const poll = window.setInterval(() => {
      if (offlineSince !== null && Date.now() - offlineSince > OFFLINE_GRACE_MS) {
        void qc.invalidateQueries({ queryKey: intelKeys.jobs(ws) });
        void qc.invalidateQueries({ queryKey: ['intel', 'job'] });
      }
    }, POLL_MS);
    s.on('intel.job.updated', onUpdate);
    s.on('disconnect', onDisconnect);
    s.on('connect', onConnect);
    return () => {
      window.clearInterval(poll);
      s.off('intel.job.updated', onUpdate);
      s.off('disconnect', onDisconnect);
      s.off('connect', onConnect);
    };
  }, [qc, ws]);
}
