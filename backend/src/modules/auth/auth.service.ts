import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';
import { users } from '../../generated/prisma/client';
import { RegisterInput, LoginInput } from './auth.schemas';
import { PasswordService } from './password.service';
import { SessionMeta, TokenService } from './token.service';

export function toUserDto(u: Pick<users, 'id' | 'email' | 'username' | 'display_name' | 'avatar_url' | 'created_at'>) {
  return { id: u.id, email: u.email, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, created_at: u.created_at };
}

const GENERIC_LOGIN_ERROR = 'Email/username atau password salah';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /** Register: membuat user + workspace pribadi dengan user sebagai Owner. */
  async register(input: RegisterInput, meta: SessionMeta) {
    const taken = await this.prisma.users.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
      select: { email: true },
    });
    if (taken) {
      const field = taken.email.toLowerCase() === input.email ? 'email' : 'username';
      throw Errors.conflict(ErrorCode.ALREADY_EXISTS, `${field} sudah terdaftar`, { field });
    }

    const password_hash = await this.passwords.hash(input.password);
    const { user, refresh } = await this.prisma.tx(async (tx) => {
      const user = await tx.users.create({
        data: { email: input.email, username: input.username, display_name: input.display_name, password_hash },
      });
      const ws = await tx.workspaces.create({ data: { name: `${input.display_name}'s Workspace`, owner_id: user.id } });
      await tx.workspace_members.create({ data: { workspace_id: ws.id, user_id: user.id, role: 'owner' } });
      const refresh = await this.tokens.issueRefresh(user.id, meta, undefined, tx);
      return { user, refresh };
    });

    return { user: toUserDto(user), ...this.tokens.signAccess(user.id), refresh_token: refresh.token };
  }

  async login(input: LoginInput, meta: SessionMeta) {
    const identifier = input.identifier.toLowerCase();
    const user = await this.prisma.users.findFirst({ where: { OR: [{ email: identifier }, { username: identifier }] } });
    if (!user) {
      await this.passwords.verifyDummy(input.password);
      throw Errors.unauthenticated(GENERIC_LOGIN_ERROR);
    }
    const ok = await this.passwords.verify(user.password_hash, input.password);
    if (!ok || !user.is_active) throw Errors.unauthenticated(GENERIC_LOGIN_ERROR);

    await this.prisma.users.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    const refresh = await this.tokens.issueRefresh(user.id, meta);
    return { user: toUserDto(user), ...this.tokens.signAccess(user.id), refresh_token: refresh.token };
  }

  async refresh(refreshToken: string | undefined, meta: SessionMeta) {
    if (!refreshToken) throw Errors.unauthenticated('Sesi tidak valid, silakan login kembali');
    const rotated = await this.tokens.rotateRefresh(refreshToken, meta);
    return { ...this.tokens.signAccess(rotated.userId), refresh_token: rotated.token };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.tokens.revokeFamilyByToken(refreshToken);
  }

  async me(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { workspace: { deleted_at: null } },
          include: { workspace: { select: { id: true, name: true, timezone: true } } },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!user) throw Errors.unauthenticated();
    return {
      user: toUserDto(user),
      workspaces: user.memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, timezone: m.workspace.timezone, role: m.role })),
    };
  }
}
