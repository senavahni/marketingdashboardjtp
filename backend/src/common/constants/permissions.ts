import { workspace_role } from '../../generated/prisma/client';
import { hasRole } from './domain';

/**
 * RBAC v1.0.0 (DSH-V1-01): izin granular di atas role workspace yang sudah ada (owner > admin > member > viewer).
 * Izin = role minimum. Semua anggota (viewer+) boleh membaca data intel non-personal.
 *
 * - Kontak personal (V1-K6/UU PDP) hanya untuk admin/owner dan tidak pernah disimpan di DB Dashboard.
 * - Keputusan manusia yang berdampak keluar (approve strategi/konten/knowledge, review kontak) = admin/owner (V1-K19).
 * - Pekerjaan harian (produk, opportunity, import, upload buku) = member.
 */
export const PERMISSIONS = {
  'products:write': 'member',
  'opportunities:write': 'member',
  'contacts:view_personal': 'admin',
  'contacts:review': 'admin',
  'knowledge:upload': 'member',
  'knowledge:approve': 'admin',
  'data:import': 'member',
  'strategy:approve': 'admin',
  'content:approve': 'admin',
} as const satisfies Record<string, workspace_role>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: workspace_role, permission: Permission): boolean {
  return hasRole(role, PERMISSIONS[permission]);
}

/** Daftar izin efektif untuk sebuah role (dikirim ke frontend agar UI menyembunyikan aksi yang tidak diizinkan). */
export function permissionsFor(role: workspace_role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
