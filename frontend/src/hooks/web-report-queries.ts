import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Page } from '../lib/types';
import type { PeriodType, WebReportPayload, WebReportSession } from '../lib/web-report-types';

export interface WebReportFilters {
  period_type?: PeriodType;
  year?: number;
}

const PAGE_SIZE = 50;

export const webReportKeys = {
  all: ['web-reports'] as const,
  list: (ws: string, f: WebReportFilters) => ['web-reports', 'list', ws, f] as const,
  detail: (id: string) => ['web-reports', 'detail', id] as const,
  compare: (ws: string, ids: string[]) => ['web-reports', 'compare', ws, ids] as const,
};

export const useWebReports = (ws: string, filters: WebReportFilters) =>
  useInfiniteQuery({
    queryKey: webReportKeys.list(ws, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<Page<WebReportSession>>(`/workspaces/${ws}/web-reports`, { query: { limit: PAGE_SIZE, cursor: pageParam, ...filters } }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

export const useWebReport = (id: string | null) =>
  useQuery({ queryKey: webReportKeys.detail(id ?? ''), enabled: !!id, queryFn: () => api<WebReportSession>(`/web-reports/${id}`) });

export const useCompareWebReports = (ws: string, ids: string[]) =>
  useQuery({
    queryKey: webReportKeys.compare(ws, ids),
    enabled: ids.length >= 2,
    queryFn: () => api<Page<WebReportSession>>(`/workspaces/${ws}/web-reports/compare`, { query: { ids: ids.join(',') } }).then((r) => r.data),
  });

export function useSaveWebReport(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    // Error ditampilkan di form (bukan toast global)
    onError: () => undefined,
    mutationFn: ({ id, version, payload }: { id?: string; version?: number; payload: Partial<WebReportPayload> }) =>
      id
        ? api<WebReportSession>(`/web-reports/${id}`, { method: 'PATCH', body: { ...payload, version } })
        : api<WebReportSession>(`/workspaces/${ws}/web-reports`, { method: 'POST', body: payload }),
    onSuccess: (session) => {
      qc.setQueryData(webReportKeys.detail(session.id), session);
      void qc.invalidateQueries({ queryKey: ['web-reports', 'list', ws] });
      void qc.invalidateQueries({ queryKey: ['web-reports', 'compare', ws] });
    },
  });
}

export function useDeleteWebReport(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/web-reports/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: webReportKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: webReportKeys.all });
    },
  });
}
