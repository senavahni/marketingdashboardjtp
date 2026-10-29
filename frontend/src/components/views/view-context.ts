import { createContext, useContext } from 'react';
import type { Role } from '../../lib/types';

export interface ViewContextValue {
  workspaceId: string;
  projectId: string;
  role: Role;
  canEdit: boolean;
  openTask: (id: string) => void;
}

export const ViewContext = createContext<ViewContextValue | null>(null);

export function useView(): ViewContextValue {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('ViewContext belum tersedia');
  return ctx;
}
