import { IntelBrowserService } from '../../src/modules/intel/intel-browser.service';
import { createBrowserProfileSchema } from '../../src/shared/schemas/browser-profile.schema';

// Login profil Chrome MCP dari Dashboard: hanya Admin/Owner, password tidak pernah melewati Dashboard

const ws = '44444444-4444-4444-8444-444444444444';
const user = { id: '77777777-7777-4777-8777-777777777777', username: 'owner', display_name: 'Owner' };

function harness(enabled = true) {
  const access = { assertWorkspace: jest.fn().mockResolvedValue({ role: 'admin' }) };
  const mcp = { call: jest.fn().mockResolvedValue({ job_id: 'j_abcdefghij', profile: 'riset-google', status: 'queued', checks: [] }) };
  const service = new IntelBrowserService({ isIntelEnabled: enabled } as never, access as never, mcp as never);
  return { service, access, mcp };
}

describe('IntelBrowserService', () => {
  it('mulai login: wajib admin dan meneruskan profil + situs ke MCP', async () => {
    const { service, access, mcp } = harness();
    const out = await service.startLogin(user, ws, 'riset-google', { sites: ['google'] });
    expect(access.assertWorkspace).toHaveBeenCalledWith(user.id, ws, 'admin');
    expect(mcp.call).toHaveBeenCalledWith('intel_browser_login_start', { profile: 'riset-google', sites: ['google'] }, expect.anything(), undefined);
    expect(out.job_id).toBe('j_abcdefghij');
  });

  it('member ditolak sebelum memanggil MCP; modul nonaktif → FEATURE_DISABLED', async () => {
    const h = harness();
    h.access.assertWorkspace.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(h.service.list(user, ws)).rejects.toThrow('FORBIDDEN');
    expect(h.mcp.call).not.toHaveBeenCalled();
    await expect(harness(false).service.list(user, ws)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('nama profil & situs divalidasi', () => {
    expect(createBrowserProfileSchema.safeParse({ name: 'riset-google', sites: ['google'] }).success).toBe(true);
    expect(createBrowserProfileSchema.safeParse({ name: '../etc', sites: ['google'] }).success).toBe(false);
    expect(createBrowserProfileSchema.safeParse({ name: 'ok', sites: ['facebook'] }).success).toBe(false);
  });
});
