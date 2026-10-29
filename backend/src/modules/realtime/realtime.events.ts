/** Nama event Socket.IO server → klien (M1_ARCHITECTURE §6). */
export const RealtimeEvent = {
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_DELETED: 'task.deleted',
  TASKS_RESCHEDULED: 'tasks.rescheduled',
  TASKS_REORDERED: 'tasks.reordered',
  BLOCK_UPSERTED: 'block.upserted',
  BLOCK_DELETED: 'block.deleted',
  BLOCKS_REORDERED: 'blocks.reordered',
  COMMENT_CREATED: 'comment.created',
  COMMENT_UPDATED: 'comment.updated',
  COMMENT_DELETED: 'comment.deleted',
  ACTIVITY_CREATED: 'activity.created',
  AGENT_STATUS: 'agent.status',
  NOTIFICATION_CREATED: 'notification.created',
} as const;

export type RealtimeEventName = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export const rooms = {
  project: (id: string) => `project:${id}`,
  task: (id: string) => `task:${id}`,
  user: (id: string) => `user:${id}`,
};
