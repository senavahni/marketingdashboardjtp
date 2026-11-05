/** Data dummy untuk pengembangan visualisasi 3D (belum tersambung ke API). Deterministik (PRNG berbenih). */
import { MAX_POINTS, SOURCES } from './mapping';
import type { FlowEvent, ProjectionPoint, ProjectionSentiment } from './types';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS = ['harga', 'promo', 'kualitas', 'layanan', 'pengiriman', 'aplikasi', 'diskon', 'merek', 'ulasan', 'tren'];
const SENTIMENTS: (ProjectionSentiment | null)[] = ['positive', 'neutral', 'negative', null];

/** Awan titik berklaster per sumber: tiap sumber punya pusat sendiri dengan sebaran normal sederhana. */
export function mockProjectionPoints(count = MAX_POINTS, seed = 7): ProjectionPoint[] {
  const rand = mulberry32(seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.6;
  const centers = SOURCES.map((_, i) => {
    const angle = (i / SOURCES.length) * Math.PI * 2;
    return [Math.cos(angle) * 3, Math.sin(angle) * 3, (i - 1.5) * 1.2] as const;
  });
  return Array.from({ length: Math.min(count, MAX_POINTS) }, (_, i) => {
    const s = Math.floor(rand() * SOURCES.length);
    const [cx, cy, cz] = centers[s];
    const sentiment = SENTIMENTS[Math.floor(rand() * rand() * SENTIMENTS.length)];
    return {
      id: `mock-${i}`,
      x: cx + gauss(),
      y: cy + gauss(),
      z: cz + gauss(),
      source: SOURCES[s],
      sentiment,
      label: `${TOPICS[i % TOPICS.length]} #${i + 1}: contoh potongan teks hasil pengumpulan`.slice(0, 60),
    };
  });
}

export const MOCK_TOKENS = [
  'diskon', 'promo', 'ongkir', 'gratis', 'kualitas', 'lambat', 'puas', 'kecewa', 'murah', 'cepat',
  'aplikasi', 'error', 'rekomendasi', 'bagus', 'mahal', 'layanan', 'ramah', 'stok', 'baru', 'viral',
];

/** Urutan event progres tiruan: collect → analyze → index, masing-masing 0..total. */
export function mockFlowEvents(total = 200, steps = 5): FlowEvent[] {
  const stages = ['collect', 'analyze', 'index'] as const;
  return stages.flatMap((stage, si) =>
    Array.from({ length: steps + 1 }, (_, k) => ({
      stage,
      done: Math.round((total * k) / steps),
      total,
      sample_tokens: MOCK_TOKENS.slice((si * 3 + k) % 6, ((si * 3 + k) % 6) + 20),
    })),
  );
}
