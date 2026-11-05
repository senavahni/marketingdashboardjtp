import { z } from 'zod';

/** Profil Chrome MCP + login manual dari Dashboard (Sumber & Koneksi). Cermin `schemas/intel.py` MCP. */
export const LOGIN_SITES = ['google', 'x', 'threads'] as const;

const profileName = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,62}$/, 'nama profil: huruf kecil, angka, - atau _ (2–63 karakter)');
const sites = z.array(z.enum(LOGIN_SITES)).min(1).max(3);

export const browserProfileSchema = z.object({
  name: z.string(),
  purpose: z.string().nullable().optional(),
  allowed_sites: z.array(z.string()),
  logged_in_sites: z.array(z.string()),
  login_checked_at: z.record(z.string(), z.string()).default({}),
  headless: z.boolean(),
  locked: z.boolean(),
  last_used: z.string().nullable().optional(),
});

export const browserProfilesSchema = z.object({ profiles: z.array(browserProfileSchema) });

export const browserLoginSchema = z.object({
  job_id: z.string(),
  profile: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  message: z.string().nullable().optional(),
  checks: z.array(z.object({ site: z.string(), logged_in: z.boolean().nullable(), detail: z.string() })).default([]),
  closed_by_user: z.boolean().nullable().optional(),
  error: z.string().nullable().optional(),
});

export const createBrowserProfileSchema = z.strictObject({ name: profileName, sites });
export const browserLoginStartSchema = z.strictObject({ sites });
export const browserProfileNameSchema = profileName;
export { mcpJobId as browserLoginJobIdSchema } from './intel.schema';
