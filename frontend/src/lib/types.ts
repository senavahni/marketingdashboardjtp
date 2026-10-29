/** Tipe DTO dari backend (lihat M1_TASK_002 & M1_TASK_003). */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
export type AgentStatus = 'idle' | 'queued' | 'thinking' | 'working' | 'completed' | 'failed';
export type ActorType = 'user' | 'agent' | 'system';

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}
export interface WorkspaceSummary {
  id: string;
  name: string;
  timezone: string;
  role: Role;
}
export interface Actor {
  type: ActorType;
  id: string | null;
  name: string | null;
  avatar_url?: string | null;
}
export interface Assignee {
  type: 'user' | 'agent';
  id: string;
  name: string;
  avatar_url: string | null;
}
export interface Project {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  created_by: { id: string; name: string } | null;
  task_count: number;
  created_at: string;
  updated_at: string;
  my_role?: Role;
}
export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  depth: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: Assignee | null;
  start_date: string | null;
  end_date: string | null;
  is_milestone: boolean;
  tags: string[];
  order_index: number;
  agent_status: AgentStatus;
  active_run: { id: string; status: string; trigger: string } | null;
  subtask_count: number;
  created_by: Actor | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface TaskDetail extends Task {
  breadcrumbs: { id: string; title: string }[];
  subtasks: Task[];
}
export interface Block {
  id: string;
  project_id: string;
  task_id: string | null;
  parent_block_id: string | null;
  block_type: string;
  content_json: { props?: Record<string, unknown>; content?: unknown };
  order_index: number;
  version: number;
  last_edited_by: Actor | null;
  children: Block[];
}
export interface Comment {
  id: string;
  entity_type: 'project' | 'task' | 'block';
  entity_id: string;
  parent_comment_id: string | null;
  author: Actor & { avatar_url: string | null };
  content: string;
  mentions: { type: 'user' | 'agent'; id: string; name: string | null }[];
  edited_at: string | null;
  created_at: string;
  reply_count: number;
  replies?: Comment[];
}
export interface Activity {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: Actor | null;
  metadata: Record<string, any>;
  created_at: string;
}
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  project_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor: Actor | null;
  read_at: string | null;
  created_at: string;
  url: string | null;
}
export interface Member {
  user: { id: string; display_name: string; username: string; email: string; avatar_url: string | null };
  role: Role;
}
export interface Agent {
  id: string;
  name: string;
  handle: string;
  mcp_agent_key: string;
  description: string | null;
  avatar_url: string | null;
  is_active: boolean;
}
export interface Assignees {
  humans: { id: string; name: string; username: string; avatar_url: string | null }[];
  agents: { id: string; name: string; handle: string; description: string | null; avatar_url: string | null }[];
}
export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}
