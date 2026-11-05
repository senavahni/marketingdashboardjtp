import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/** Profil Chrome MCP + login manual (Sumber & Koneksi). Hanya Admin/Owner. */
export type LoginSite = 'google' | 'x' | 'threads';

export type BrowserProfile = {
  name: string;
  purpose?: string | null;
  allowed_sites: string[];
  logged_in_sites: string[];
  login_checked_at: Record<string, string>;
  headless: boolean;
  locked: boolean;
  last_used?: string | null;
};

export type BrowserLogin = {
  job_id: string;
  profile: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  message?: string | null;
  checks: { site: string; logged_in: boolean | null; detail: string }[];
  closed_by_user?: boolean | null;
  error?: string | null;
};

/** Kunci situs MCP (SITE_CHECKS) per pilihan login. */
export const SITE_KEY: Record<LoginSite, string> = { google: 'trends.google.com', x: 'x.com', threads: 'threads.net' };
export const SITE_LABEL: Record<string, string> = { 'trends.google.com': 'Google', 'x.com': 'X', 'threads.net': 'Threads' };

const LOGIN_POLL_MS = 2_000;
const keys = {
  profiles: (ws: string) => ['intel', 'browser-profiles', ws] as const,
  login: (ws: string, jobId: string) => ['intel', 'browser-login', ws, jobId] as const,
};

export const isLoginActive = (l?: BrowserLogin) => l?.status === 'queued' || l?.status === 'running';

export const useBrowserProfiles = (ws: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.profiles(ws),
    queryFn: () => api<{ profiles: BrowserProfile[] }>(`/workspaces/${ws}/intel/browser-profiles`).then((r) => r.profiles),
    enabled,
    retry: false,
  });

export function useBrowserLogin(ws: string, jobId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.login(ws, jobId ?? ''),
    enabled: !!jobId,
    queryFn: async () => {
      const login = await api<BrowserLogin>(`/workspaces/${ws}/intel/browser-logins/${jobId}`);
      if (!isLoginActive(login)) void qc.invalidateQueries({ queryKey: keys.profiles(ws) });
      return login;
    },
    refetchInterval: (q) => (isLoginActive(q.state.data) || !q.state.data ? LOGIN_POLL_MS : false),
    retry: false,
  });
}

export function useBrowserProfileActions(ws: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.profiles(ws) });
  return {
    create: useMutation({
      mutationFn: (body: { name: string; sites: LoginSite[] }) => api<BrowserProfile>(`/workspaces/${ws}/intel/browser-profiles`, { method: 'POST', body }),
      onSuccess: refresh,
    }),
    startLogin: useMutation({
      mutationFn: ({ name, sites }: { name: string; sites: LoginSite[] }) =>
        api<BrowserLogin>(`/workspaces/${ws}/intel/browser-profiles/${name}/login`, { method: 'POST', body: { sites } }),
      onSuccess: refresh,
    }),
    cancelLogin: useMutation({
      mutationFn: (jobId: string) => api<BrowserLogin>(`/workspaces/${ws}/intel/browser-logins/${jobId}/cancel`, { method: 'POST' }),
      onSuccess: (login) => qc.setQueryData(keys.login(ws, login.job_id), login),
    }),
  };
}
