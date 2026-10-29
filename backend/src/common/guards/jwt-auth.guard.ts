import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { TokenService } from '../../modules/auth/token.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Errors } from '../exceptions/app.exception';
import { AppRequest } from '../types/request.types';

/** Guard global: semua endpoint butuh Bearer JWT kecuali yang ditandai @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw Errors.unauthenticated();

    const userId = this.tokens.verifyAccess(header.slice(7).trim());
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, username: true, display_name: true, is_active: true },
    });
    if (!user?.is_active) throw Errors.unauthenticated('Token tidak valid');

    req.user = { id: user.id, username: user.username, display_name: user.display_name };
    return true;
  }
}
