import { create } from 'zustand';
import type { User, WorkspaceSummary } from './types';

interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  token: string | null;
  user: User | null;
  workspaces: WorkspaceSummary[];
  setSession: (token: string, user?: User) => void;
  setMe: (user: User, workspaces: WorkspaceSummary[]) => void;
  setAnonymous: () => void;
}

/** Access token disimpan di memori saja (bukan localStorage) — M1_ARCHITECTURE §5. */
export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  token: null,
  user: null,
  workspaces: [],
  setSession: (token, user) => set((s) => ({ token, user: user ?? s.user })),
  setMe: (user, workspaces) => set({ user, workspaces, status: 'authenticated' }),
  setAnonymous: () => set({ status: 'anonymous', token: null, user: null, workspaces: [] }),
}));

export const getToken = () => useAuth.getState().token;
