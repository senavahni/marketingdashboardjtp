import { Env } from './env.schema';

/** Konfigurasi aplikasi yang sudah tervalidasi. Disediakan global oleh ConfigModule. */
export class AppConfigService {
  constructor(readonly env: Env) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** Origin frontend yang diizinkan CORS (APP_URL boleh dipisah koma). */
  get appOrigins(): string[] {
    return this.env.APP_URL.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /** URL frontend utama untuk menyusun link (notifikasi, payload MCP). */
  get appBaseUrl(): string {
    return this.appOrigins[0] ?? 'http://localhost:5173';
  }

  get apiBaseUrl(): string {
    return `${this.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1`;
  }
}
