import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Preferensi tampilan per project (disimpan di localStorage) — TASK_006 §Data & State. */
interface UiState {
  colWidths: Record<string, number>;
  expanded: Record<string, string[]>; // projectId → task ids yang di-expand
  zoom: 'day' | 'week';
  boardSubtasks: boolean;
  sidebarOpen: boolean;
  setColWidth: (col: string, w: number) => void;
  toggleExpanded: (projectId: string, taskId: string) => void;
  setZoom: (z: 'day' | 'week') => void;
  setBoardSubtasks: (v: boolean) => void;
  toggleSidebar: () => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      colWidths: {},
      expanded: {},
      zoom: 'day',
      boardSubtasks: false,
      sidebarOpen: true,
      setColWidth: (col, w) => set((s) => ({ colWidths: { ...s.colWidths, [col]: w } })),
      toggleExpanded: (projectId, taskId) =>
        set((s) => {
          const cur = new Set(s.expanded[projectId] ?? []);
          if (cur.has(taskId)) cur.delete(taskId);
          else cur.add(taskId);
          return { expanded: { ...s.expanded, [projectId]: [...cur] } };
        }),
      setZoom: (zoom) => set({ zoom }),
      setBoardSubtasks: (boardSubtasks) => set({ boardSubtasks }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: 'marketing-ui' },
  ),
);
