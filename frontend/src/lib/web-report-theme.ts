/**
 * Palet laporan Modul 2 — satu warna = satu makna, sama di modal, PDF, XLSX, PPTX.
 * Mengikuti deck referensi (navy gelap + teal) agar laporan terasa satu keluarga.
 */
export const REPORT_COLORS = {
  navy: '#0F2340',
  teal: '#0E9384',
  tealSoft: '#E6F4F2',
  paper: '#F5F7FA',
  ink: '#1F2937',
  inkSoft: '#5B6474',
  line: '#E3E7ED',
  // Funnel
  visitors: '#8FA3BF',
  leads: '#0E9384',
  sales: '#0F2340',
  // Biaya
  revenue: '#0E9384',
  costMaintenance: '#D9822B',
  costAds: '#F0B67F',
  // Status insight
  success: '#0B7A6E',
  warning: '#B45309',
  danger: '#C2410C',
  info: '#1D5FA8',
} as const;

/** Warna seri perbandingan (urut periode). */
export const SERIES_COLORS = ['#0E9384', '#0F2340', '#D9822B', '#1D5FA8', '#8FA3BF', '#7C3AED'];

export const hex = (color: string) => color.replace('#', '');
