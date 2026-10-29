import { createContext } from 'react';

/** Data yang dibutuhkan custom block (mis. daftar agent untuk AI Prompt). */
export const EditorAgentsContext = createContext<{ id: string; name: string }[]>([]);
