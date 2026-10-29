import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { PrismaService, Tx } from '../../database/prisma.service';
import { randomToken, sha256Hex } from '../../utils/helpers/crypto.util';
import { parseDurationToSeconds } from '../../utils/helpers/duration.util';

export interface AccessTokenResult {
  access_token: string;
  expires_in: number;
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

/** JWT access token + refresh token opaque dengan rotasi & deteksi reuse. */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessTtlSec: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {
    this.accessTtlSec = parseDurationToSeconds(config.env.JWT_ACCESS_TTL);
  }

  get refreshTtlMs(): number {
    return this.config.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
  }

  signAccess(userId: string): AccessTokenResult {
    const access_token = this.jwt.sign({ sub: userId, jti: randomUUID() }, { expiresIn: this.accessTtlSec });
    return { access_token, expires_in: this.accessTtlSec };
  }

  /** Verifikasi access token → user id. Melempar 401 TOKEN_EXPIRED / UNAUTHENTICATED. */
  verifyAccess(token: string): string {
    try {
      const payload = this.jwt.verify<{ sub?: unknown }>(token, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string') throw new Error('sub tidak valid');
      return payload.sub;
    } catch (err) {
      if ((err as Error).name === 'TokenExpiredError') {
        throw Errors.unauthenticated('Sesi telah berakhir', ErrorCode.TOKEN_EXPIRED);
      }
      throw Errors.unauthenticated('Token tidak valid');
    }
  }

  async issueRefresh(userId: string, meta: SessionMeta, familyId: string = randomUUID(), tx: Tx = this.prisma): Promise<{ token: string; id: string }> {
    const token = randomToken(32);
    const record = await tx.refresh_tokens.create({
      data: {
        user_id: userId,
        family_id: familyId,
        token_hash: sha256Hex(token),
        expires_at: new Date(Date.now() + this.refreshTtlMs),
        user_agent: meta.userAgent?.slice(0, 500),
        ip_address: meta.ip ?? null,
      },
    });
    return { token, id: record.id };
  }

  /** Rotasi refresh token. Token yang sudah dicabut dipakai lagi → seluruh family dicabut. */
  async rotateRefresh(token: string, meta: SessionMeta): Promise<{ userId: string; token: string }> {
    const invalid = () => Errors.unauthenticated('Sesi tidak valid, silakan login kembali');
    const existing = await this.prisma.refresh_tokens.findUnique({ where: { token_hash: sha256Hex(token) } });
    if (!existing) throw invalid();

    if (existing.revoked_at) {
      this.logger.warn({ user_id: existing.user_id, family_id: existing.family_id }, 'Refresh token reuse terdeteksi, family dicabut');
      await this.revokeFamily(existing.family_id);
      throw invalid();
    }
    if (existing.expires_at.getTime() <= Date.now()) throw invalid();

    const user = await this.prisma.users.findUnique({ where: { id: existing.user_id }, select: { is_active: true } });
    if (!user?.is_active) throw invalid();

    return this.prisma.tx(async (tx) => {
      // Klaim token secara atomik agar dua request paralel tidak sama-sama berhasil
      const claimed = await tx.refresh_tokens.updateMany({ where: { id: existing.id, revoked_at: null }, data: { revoked_at: new Date() } });
      if (claimed.count === 0) throw invalid();
      const next = await this.issueRefresh(existing.user_id, meta, existing.family_id, tx);
      await tx.refresh_tokens.update({ where: { id: existing.id }, data: { replaced_by: next.id } });
      return { userId: existing.user_id, token: next.token };
    });
  }

  async revokeFamilyByToken(token: string): Promise<void> {
    const existing = await this.prisma.refresh_tokens.findUnique({ where: { token_hash: sha256Hex(token) }, select: { family_id: true } });
    if (existing) await this.revokeFamily(existing.family_id);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refresh_tokens.updateMany({ where: { family_id: familyId, revoked_at: null }, data: { revoked_at: new Date() } });
  }

  /** Hapus token kedaluwarsa > 30 hari (dipanggil maintenance harian). */
  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const res = await this.prisma.refresh_tokens.deleteMany({ where: { expires_at: { lt: cutoff } } });
    return res.count;
  }
}
