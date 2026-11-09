/** Nama event Socket.IO server → klien (M1_ARCHITECTURE §6). */
export const RealtimeEvent = {
  PROJECT_CREATED: 'project.created',
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
  INTEL_JOB_UPDATED: 'intel.job.updated',
  // Kontrak 1.3 (DSH-V1-02) — room workspace
  INTEL_JOB_PAUSED: 'intel.job.paused',
  INTEL_JOB_AWAITING_REVIEW: 'intel.job.awaiting_review',
  INTEL_COMPANY_UPSERTED: 'intel.company.upserted',
  CI_IMPORT_STATUS: 'ci.import.status',
  KN_ASSET_STATUS: 'kn.asset.status',
  OPP_SCORES_UPDATED: 'opp.scores.updated',
  CT_BATCH_READY: 'ct.batch.ready',
  APPROVAL_CREATED: 'approval.created',
} as const;

export type RealtimeEventName = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export const rooms = {
  project: (id: string) => `project:${id}`,
  task: (id: string) => `task:${id}`,
  user: (id: string) => `user:${id}`,
  workspace: (id: string) => `workspace:${id}`,
};
