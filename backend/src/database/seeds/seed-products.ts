import { PrismaClient } from '../../generated/prisma/client';
import { SEED_IDS } from './seed-ids';

/** DSH-V1-01: 2 produk demo + fitur (idempotent; fitur ditulis ulang sesuai daftar ini). */
const PRODUCTS = [
  {
    id: SEED_IDS.productSim,
    name: 'SIMS — Sistem Informasi Manajemen Sekolah',
    slug: 'sims-sekolah',
    category: 'Software Pendidikan',
    description: 'Aplikasi web administrasi sekolah: data siswa, nilai, absensi, keuangan, dan rapor digital.',
    value_proposition: 'Administrasi sekolah tanpa kertas; laporan Dapodik & rapor selesai dalam hitungan menit.',
    target_notes: 'SMA/SMK/MA negeri & swasta, dinas pendidikan kab/kota.',
    price_range: 'Rp15–60 jt / tahun',
    deal_value_estimate: '35000000',
    features: [
      { name: 'Rapor digital', description: 'Rapor kurikulum merdeka otomatis dari nilai harian', benefit: 'Hemat waktu wali kelas' },
      { name: 'Absensi QR', description: 'Absensi siswa & guru dengan QR/NFC', benefit: 'Data kehadiran real-time untuk orang tua' },
      { name: 'Keuangan sekolah', description: 'SPP, tagihan, dan laporan BOS', benefit: 'Transparansi dana sekolah' },
    ],
  },
  {
    id: SEED_IDS.productErp,
    name: 'ERP Manufaktur Ringan',
    slug: 'erp-manufaktur',
    category: 'Software Bisnis',
    description: 'ERP modular untuk manufaktur kecil-menengah: persediaan, produksi, pembelian, dan akuntansi.',
    value_proposition: 'Stok & biaya produksi akurat setiap hari tanpa spreadsheet terpisah.',
    target_notes: 'Pabrik 20–300 karyawan, KBLI 10–33 (industri pengolahan).',
    price_range: 'Rp80–250 jt implementasi',
    deal_value_estimate: '150000000',
    features: [
      { name: 'Persediaan multi-gudang', description: 'Stok per lokasi dengan batch & kedaluwarsa', benefit: 'Kurangi selisih stok' },
      { name: 'Perencanaan produksi', description: 'BOM, work order, dan kapasitas mesin', benefit: 'Jadwal produksi realistis' },
      { name: 'Akuntansi terintegrasi', description: 'Jurnal otomatis dari transaksi operasional', benefit: 'Tutup buku lebih cepat' },
    ],
  },
] as const;

export async function seedProducts(prisma: PrismaClient): Promise<void> {
  for (const { features, ...product } of PRODUCTS) {
    await prisma.products.upsert({
      where: { id: product.id },
      create: { ...product, workspace_id: SEED_IDS.wsDemo, status: 'active', created_by: SEED_IDS.owner },
      update: {},
    });
    await prisma.$transaction([
      prisma.product_features.deleteMany({ where: { product_id: product.id } }),
      prisma.product_features.createMany({ data: features.map((f, i) => ({ ...f, product_id: product.id, order_index: i })) }),
    ]);
  }
}
