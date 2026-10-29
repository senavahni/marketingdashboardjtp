import type { AgentStatus, TaskPriority, TaskStatus } from './types';

export const STATUSES: { value: TaskStatus; label: string; dot: string; chip: string }[] = [
  { value: 'todo', label: 'To Do', dot: 'bg-stone-400', chip: 'bg-stone-200/70 text-stone-700' },
  { value: 'in_progress', label: 'In Progress', dot: 'bg-blue-500', chip: 'bg-blue-100 text-blue-800' },
  { value: 'in_review', label: 'In Review', dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
];
export const statusMeta = (s: TaskStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];

export const PRIORITIES: { value: TaskPriority; label: string; chip: string }[] = [
  { value: 'none', label: 'Kosong', chip: 'text-ink-faint' },
  { value: 'low', label: 'Rendah', chip: 'bg-stone-100 text-stone-700' },
  { value: 'medium', label: 'Sedang', chip: 'bg-yellow-100 text-yellow-800' },
  { value: 'high', label: 'Tinggi', chip: 'bg-orange-100 text-orange-800' },
  { value: 'urgent', label: 'Mendesak', chip: 'bg-red-100 text-red-800' },
];
export const priorityMeta = (p: TaskPriority) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[0];

export const AGENT_STATUS: Record<AgentStatus, { label: string; className: string; animated?: boolean } | null> = {
  idle: null,
  queued: { label: 'Menunggu', className: 'bg-stone-100 text-stone-600' },
  thinking: { label: 'Thinking', className: 'bg-agent-soft text-agent', animated: true },
  working: { label: 'Working', className: 'bg-agent-soft text-agent', animated: true },
  completed: { label: 'Done', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Gagal', className: 'bg-red-50 text-red-700' },
};

export const FEATURE_AI_PROMPT_BLOCK = import.meta.env.VITE_FEATURE_AI_PROMPT_BLOCK === 'true';
