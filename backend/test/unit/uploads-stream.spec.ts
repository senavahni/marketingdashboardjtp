/**
 * DSH-V1-02 — upload streaming: Dashboard → mock MCP 1.3 lewat HTTP sungguhan.
 * 100 MB lulus / 101 MB ditolak tanpa RSS naik > 200 MB; magic bytes; tujuan vs jenis file; izin.
 */
import { Readable } from 'node:stream';
import { AppException } from '../../src/common/exceptions/app.exception';
import { UploadsService, sanitizeFilename } from '../../src/modules/market-intel/uploads.service';
import { magicMatches, uploadKindFor } from '../../src/modules/market-intel/upload-guard';
import { MockMcp13, startMockMcp13 } from '../../src/scripts/mock-mcp-13';

const KEY = 'mcpk_test0002_' + 'b'.repeat(43);
const WS = '00000000-0000-4000-8000-000000000001';
const user = { id: '00000000-0000-4000-8000-000000000103', username: 'member', display_name: 'Member' };
const MB = 1024 * 1024;
const CHUNK = 256 * 1024;

/** Stream sintetis berukuran `size` dengan header magic; chunk dibuat ulang (tidak pernah satu buffer besar). */
function fileStream(size: number, head: string): Readable {
  let sent = 0;
  return new Readable({
    read() {
      if (sent >= size) return this.push(null);
      const n = Math.min(CHUNK, size - sent);
      const chunk = Buffer.alloc(n, 0x20);
      if (sent === 0) chunk.write(head, 0, 'latin1');
      sent += n;
      this.push(chunk);
    },
  });
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (err) {
    return err instanceof AppException ? err.code : (err as Error).message;
  }
}

describe('UploadsService (streaming ke mock MCP)', () => {
  let mock: MockMcp13;
  let created: unknown[];
  let access: { assertPermission: jest.Mock; assertWorkspace: jest.Mock };
  let service: UploadsService;

  beforeAll(async () => {
    mock = await startMockMcp13({ apiKey: KEY });
  });
  afterAll(() => mock.close());
  beforeEach(() => {
    created = [];
    access = { assertPermission: jest.fn().mockResolvedValue({ role: 'member' }), assertWorkspace: jest.fn() };
    const prisma = { upload_refs: { create: jest.fn(({ data }) => (created.push(data), Promise.resolve({ ...data, id: 'x', status_cache: 'stored', created_at: new Date() }))) } };
    service = new UploadsService({ env: { MCP_INTEL_API_KEY: KEY, MCP_SERVER_URL: `${mock.url}/mcp` } } as never, prisma as never, access as never);
  });

  it('PDF 100 MB lulus, metadata tersimpan, RSS naik < 200 MB', async () => {
    global.gc?.();
    const before = process.memoryUsage().rss;
    let peak = before;
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20);
    try {
      const out = await service.upload(user, WS, { purpose: 'book', filename: 'buku.pdf' }, fileStream(100 * MB, '%PDF-1.7\n'));
      expect(out).toMatchObject({ kind: 'pdf', purpose: 'book', size: 100 * MB, filename: 'buku.pdf' });
    } finally {
      clearInterval(timer);
    }
    expect(peak - before).toBeLessThan(200 * MB);
    expect(created).toHaveLength(1);
    expect(mock.stats.maxChunkBytes).toBeLessThanOrEqual(1 * MB);
    expect(access.assertPermission).toHaveBeenCalledWith(user.id, WS, 'knowledge:upload');
  }, 120_000);

  it('PDF 101 MB ditolak UPLOAD_TOO_LARGE (stream dihentikan, tidak ada metadata)', async () => {
    const uploadsBefore = mock.stats.uploads;
    expect(await codeOf(service.upload(user, WS, { purpose: 'book', filename: 'buku.pdf' }, fileStream(101 * MB, '%PDF-1.7\n')))).toBe('UPLOAD_TOO_LARGE');
    expect(created).toHaveLength(0);
    expect(mock.stats.uploads).toBe(uploadsBefore);
  }, 120_000);

  it('Content-Length melebihi batas ditolak sebelum membaca body', async () => {
    const body = fileStream(1024, '%PDF-');
    expect(await codeOf(service.upload(user, WS, { purpose: 'book', filename: 'b.pdf', contentLength: 101 * MB }, body))).toBe('UPLOAD_TOO_LARGE');
    expect(body.readableFlowing).not.toBe(true);
  });

  it('XLSX 20 MB lulus, 21 MB ditolak; izin data:import', async () => {
    const ok = await service.upload(user, WS, { purpose: 'import', filename: 'instansi.xlsx' }, fileStream(20 * MB, 'PK\x03\x04'));
    expect(ok).toMatchObject({ kind: 'xlsx', size: 20 * MB });
    expect(access.assertPermission).toHaveBeenCalledWith(user.id, WS, 'data:import');
    expect(await codeOf(service.upload(user, WS, { purpose: 'import', filename: 'instansi.xlsx' }, fileStream(21 * MB, 'PK\x03\x04')))).toBe('UPLOAD_TOO_LARGE');
  }, 60_000);

  it('magic bytes tidak cocok → UNSUPPORTED_FILE (file .pdf berisi ZIP)', async () => {
    expect(await codeOf(service.upload(user, WS, { purpose: 'book', filename: 'palsu.pdf' }, fileStream(4096, 'PK\x03\x04')))).toBe('UNSUPPORTED_FILE');
  });

  it('izin ditolak → tidak ada panggilan ke MCP', async () => {
    access.assertPermission.mockRejectedValueOnce(new AppException('FORBIDDEN', 'x', 403));
    const uploads = mock.stats.uploads;
    expect(await codeOf(service.upload(user, WS, { purpose: 'import', filename: 'a.csv' }, fileStream(10, 'a,b\n')))).toBe('FORBIDDEN');
    expect(mock.stats.uploads).toBe(uploads);
  });
});

describe('upload-guard helpers', () => {
  it('jenis file dari ekstensi harus sesuai tujuan', async () => {
    expect(uploadKindFor('Buku.PDF', 'book')).toBe('pdf');
    expect(uploadKindFor('data.csv', 'import')).toBe('csv');
    expect(() => uploadKindFor('data.csv', 'book')).toThrow(AppException);
    expect(() => uploadKindFor('buku.pdf', 'import')).toThrow(AppException);
    expect(() => uploadKindFor('skrip.exe', 'import')).toThrow(AppException);
  });

  it('magic bytes', () => {
    expect(magicMatches('pdf', Buffer.from('%PDF-1.4'))).toBe(true);
    expect(magicMatches('xlsx', Buffer.from('PK\x03\x04abcd', 'latin1'))).toBe(true);
    expect(magicMatches('csv', Buffer.from('nama,alamat\n'))).toBe(true);
    expect(magicMatches('csv', Buffer.from([0x61, 0x00, 0x62]))).toBe(false);
    expect(magicMatches('csv', Buffer.from('%PDF-1.4'))).toBe(false);
  });

  it('nama file disanitasi (tanpa path & karakter kontrol)', () => {
    expect(sanitizeFilename('..%2F..%2Fetc%2Fpasswd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\daftar%20instansi.xlsx')).toBe('daftar instansi.xlsx');
    expect(sanitizeFilename('a\u0000b.csv')).toBe('ab.csv');
    expect(() => sanitizeFilename('..')).toThrow(AppException);
  });
});
