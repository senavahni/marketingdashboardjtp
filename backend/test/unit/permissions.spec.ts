import { AppException } from '../../src/common/exceptions/app.exception';
import { PERMISSIONS, can, permissionsFor } from '../../src/common/constants/permissions';
import { AccessService } from '../../src/modules/core/access.service';

// DSH-V1-01: matriks RBAC v1.0.0

describe('PERMISSIONS', () => {
  it('memuat 9 izin baru', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual([
      'contacts:review',
      'contacts:view_personal',
      'content:approve',
      'data:import',
      'knowledge:approve',
      'knowledge:upload',
      'opportunities:write',
      'products:write',
      'strategy:approve',
    ]);
  });

  it('viewer hanya baca: tidak punya izin tulis/approve apa pun', () => {
    expect(permissionsFor('viewer')).toEqual([]);
  });

  it('member: kerja harian, tanpa kontak personal & approve', () => {
    expect(permissionsFor('member').sort()).toEqual(['data:import', 'knowledge:upload', 'opportunities:write', 'products:write']);
    expect(can('member', 'contacts:view_personal')).toBe(false);
    expect(can('member', 'content:approve')).toBe(false);
  });

  it('admin & owner: semua izin, termasuk kontak personal', () => {
    expect(permissionsFor('admin')).toHaveLength(9);
    expect(permissionsFor('owner')).toHaveLength(9);
  });
});

describe('AccessService.assertPermission', () => {
  const ws = '00000000-0000-4000-8000-000000000001';
  function service(role: string | null) {
    const prisma = {
      workspaces: { findFirst: jest.fn().mockResolvedValue({ id: ws, name: 'Demo', timezone: 'Asia/Jakarta' }) },
      workspace_members: { findUnique: jest.fn().mockResolvedValue(role ? { role } : null) },
    };
    const redis = { client: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') } };
    return new AccessService(prisma as never, redis as never);
  }
  const status = async (p: Promise<unknown>) => {
    try {
      await p;
      return 200;
    } catch (err) {
      return (err as AppException).getStatus();
    }
  };

  it('izin cukup → lolos dengan role', async () => {
    await expect(service('admin').assertPermission('u', ws, 'content:approve')).resolves.toMatchObject({ role: 'admin' });
  });
  it('izin kurang → 403', async () => {
    expect(await status(service('member').assertPermission('u', ws, 'contacts:view_personal'))).toBe(403);
  });
  it('bukan anggota → 404 (anti-IDOR)', async () => {
    expect(await status(service(null).assertPermission('u', ws, 'products:write'))).toBe(404);
  });
});
