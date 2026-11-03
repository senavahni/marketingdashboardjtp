import type { Request } from 'express';

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
}

/** Aktor yang melakukan perubahan (user, agent, atau sistem). */
export interface Actor {
  type: 'user' | 'agent' | 'system';
  id: string | null;
  name?: string;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  mcpAgent?: { id: string; workspace_id: string; name: string; handle: string };
  rawBody?: Buffer;
}

export function userActor(user: AuthUser): Actor {
  return { type: 'user', id: user.id, name: user.display_name };
}
