import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppRequest, AuthUser } from '../types/request.types';

/** Mengambil user terautentikasi dari request. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AppRequest>().user as AuthUser;
});

/** Header X-Client-Id (id tab browser) untuk menandai origin event real-time. */
export const ClientId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const value = ctx.switchToHttp().getRequest<AppRequest>().header('x-client-id');
  return value && value.length <= 64 ? value : null;
});
