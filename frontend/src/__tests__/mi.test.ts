import { describe, expect, it } from 'vitest';
import {
  BULK_SUBJECTS,
  CF_STATUS_META,
  JOB13_STATUS_META,
  PAUSE_META,
  budgetWarning,
  canBulkDecide,
  confidenceLevel,
  formatBytes,
  formatDurationRange,
  formatEta,
  lineDiff,
  mappingChanged,
  sortMapping,
  stageLabel,
  validateUploadFile,
} from '../lib/mi-format';
import type { Estimate13, MappingEntry } from '../lib/mi-types';
import { uploadErrorMessage } from '../lib/upload';
import { DEFAULT_AGENT_ROLES } from '../pages/mi/AgentTeamPage';

const MB = 1024 * 1024;

describe('keputusan PO (10 Nov 2026)', () => {
  it('#4 approve massal hanya untuk knowledge card (item konten di Bank Konten)', () => {
    expect(BULK_SUBJECTS).toEqual(['knowledge_card']);
    expect(canBulkDecide('knowledge_card')).toBe(true);
    for (const s of ['strategy', 'doctrine', 'contact_batch', 'import_review', 'product_analysis'] as const) expect(canBulkDecide(s)).toBe(false);
  });
});

describe('status & banner', () => {
  it('status job selalu punya label teks; pause/review berwarna amber/biru, bukan teal', () => {
    expect(Object.values(JOB13_STATUS_META).every((m) => m.label.length > 0)).toBe(true);
    expect(JOB13_STATUS_META.paused.tone).toBe('warn');
    expect(JOB13_STATUS_META.awaiting_review.tone).toBe('review');
    expect(CF_STATUS_META.ambiguous.tone).toBe('warn');
  });
  it('model lokal mati tidak menawarkan jalur CPU (V1-K7)', () => {
    expect(PAUSE_META.local_model_unavailable.body).toMatch(/Tidak ada jalur cadangan ke CPU/);
    expect(PAUSE_META.captcha.body).toMatch(/tidak mengakali CAPTCHA/);
  });
  it('label tahap dikenal, tahap asing tetap terbaca', () => {
    expect(stageLabel('crawl_contacts')).toBe('Ambil kontak');
    expect(stageLabel('custom_step')).toBe('custom step');
  });
});

describe('format', () => {
  it('confidence: ≥0,8 tinggi · 0,5–0,8 sedang · <0,5 rendah', () => {
    expect([0.95, 0.8, 0.79, 0.5, 0.49].map(confidenceLevel)).toEqual(['high', 'high', 'medium', 'medium', 'low']);
  });
  it('ETA panjang dalam hari/jam (rem volume Chrome)', () => {
    expect(formatEta(129_600)).toBe('±1,5 hari');
    expect(formatEta(21_600)).toBe('±6 jam');
    expect(formatEta(30)).toBe('±1 mnt');
    expect(formatDurationRange({ min: 3_600, max: 21_600 })).toBe('±1 jam – 6 jam');
  });
  it('ukuran file', () => {
    expect(formatBytes(100 * MB)).toBe('100 MB');
    expect(formatBytes(2048)).toBe('2 KB');
  });
});

describe('ringkasan mapping kolom (§C.6)', () => {
  const m = (source_col: string, field: string | null, confidence: number | null): MappingEntry => ({ source_col, field, transform: null, confidence, method: 'local' });
  const mapping = [m('Nama', 'name', 0.98), m('Catatan', null, null), m('Kab/Kota', 'location.regency_code', 0.64), m('Telp', 'contact.phone_generic', 0.77)];

  it('confidence rendah di atas, kolom diabaikan di bawah, sisanya urutan asli', () => {
    expect(sortMapping(mapping).map((x) => x.source_col)).toEqual(['Kab/Kota', 'Nama', 'Telp', 'Catatan']);
  });
  it('perubahan terdeteksi hanya bila field berubah (bukan urutan)', () => {
    expect(mappingChanged(mapping, sortMapping(mapping))).toBe(false);
    expect(mappingChanged(mapping, mapping.map((x) => (x.source_col === 'Catatan' ? { ...x, field: 'notes' } : x)))).toBe(true);
  });
});

describe('upload', () => {
  it('cek awal ekstensi & batas per tujuan', () => {
    expect(validateUploadFile({ name: 'buku.pdf', size: 100 * MB }, 'book')).toBeNull();
    expect(validateUploadFile({ name: 'buku.pdf', size: 100 * MB + 1 }, 'book')).toMatch(/melebihi batas/);
    expect(validateUploadFile({ name: 'data.xlsx', size: 21 * MB }, 'import')).toMatch(/melebihi batas/);
    expect(validateUploadFile({ name: 'data.csv', size: 10 }, 'import')).toBeNull();
    expect(validateUploadFile({ name: 'data.csv', size: 10 }, 'book')).toMatch(/tidak didukung/);
    expect(validateUploadFile({ name: 'kosong.pdf', size: 0 }, 'brand')).toBe('File kosong');
  });
  it('pesan penolakan server inline (§E)', () => {
    expect(uploadErrorMessage(413)).toMatch(/100 MB/);
    expect(uploadErrorMessage(415)).toMatch(/tidak sesuai ekstensi/);
    expect(uploadErrorMessage(429)).toMatch(/Terlalu banyak/);
    expect(uploadErrorMessage(500, 'x')).toBe('x');
  });
});

describe('budget', () => {
  const est = { llm: { usd_est: 1, llm_assist_usd_est: 2 }, external: { usd: 0 } } as unknown as Estimate13;
  it('budget di bawah estimasi (termasuk LLM assist) → peringatan, kosong → tanpa batas', () => {
    expect(budgetWarning(null, est, true)).toBeNull();
    expect(budgetWarning(2, est, false)).toBeNull();
    expect(budgetWarning(2, est, true)).toMatch(/di bawah estimasi \$3\.00/);
  });
});

describe('lineDiff (bandingkan versi doktrin)', () => {
  it('menandai baris tambah/hapus dan mempertahankan yang sama', () => {
    expect(lineDiff('a\nb\nc', 'a\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ]);
    expect(lineDiff('', 'x')).toEqual([
      { kind: 'del', text: '' },
      { kind: 'add', text: 'x' },
    ]);
  });
});

describe('agent default (DSH-V1-04)', () => {
  it('6 agent sesuai V1-K17, urutan tetap', () => {
    expect(DEFAULT_AGENT_ROLES.map((a) => a.key)).toEqual(['researcher', 'analyst', 'strategist', 'creative', 'curator', 'prospector']);
  });
});
