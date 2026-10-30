import { create } from 'zustand';
import { useUi } from './ui-store';

/** Status tutorial penggunaan (tour fitur demi fitur). */
interface TourState {
  open: boolean;
  step: number;
  start: () => void;
  stop: () => void;
  go: (step: number) => void;
}

export const useTour = create<TourState>()((set) => ({
  open: false,
  step: 0,
  start: () => {
    // Langkah-langkah awal menyorot sidebar, jadi pastikan terbuka.
    if (!useUi.getState().sidebarOpen) useUi.getState().toggleSidebar();
    set({ open: true, step: 0 });
  },
  stop: () => set({ open: false, step: 0 }),
  go: (step) => set({ step }),
}));
