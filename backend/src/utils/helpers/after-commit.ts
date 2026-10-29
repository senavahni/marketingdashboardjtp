import { Logger } from '@nestjs/common';

type Effect = () => unknown | Promise<unknown>;

/**
 * Mengumpulkan efek samping (emit real-time, enqueue job, notifikasi) yang baru boleh
 * dijalankan SETELAH transaksi database commit. Error efek samping hanya di-log.
 */
export class AfterCommit {
  private static readonly logger = new Logger('AfterCommit');
  private readonly effects: Effect[] = [];

  add(effect: Effect): void {
    this.effects.push(effect);
  }

  async run(): Promise<void> {
    for (const effect of this.effects.splice(0)) {
      try {
        await effect();
      } catch (err) {
        AfterCommit.logger.error({ err }, 'Efek samping setelah commit gagal');
      }
    }
  }
}
