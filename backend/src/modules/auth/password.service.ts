import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Parameter argon2id sesuai rekomendasi OWASP (TASK_001 §C.1). */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Dipakai saat user tidak ditemukan agar waktu respons login tetap setara. */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-1');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
