import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AppRequest, AuthUser } from '../../common/types/request.types';
import { LoginInput, loginSchema, RegisterInput, registerSchema } from './auth.schemas';
import { AuthService } from './auth.service';
import { SessionMeta, TokenService } from './token.service';

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @RateLimit('auth')
  @Post('register')
  @ApiZodBody(registerSchema)
  async register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { refresh_token, ...result } = await this.auth.register(body, this.meta(req));
    this.setRefreshCookie(res, refresh_token);
    return result;
  }

  @Public()
  @RateLimit('auth')
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { refresh_token, ...result } = await this.auth.login(body, this.meta(req));
    this.setRefreshCookie(res, refresh_token);
    return result;
  }

  @Public()
  @RateLimit('refresh')
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const { refresh_token, ...result } = await this.auth.refresh(this.readCookie(req), this.meta(req));
      this.setRefreshCookie(res, refresh_token);
      return result;
    } catch (err) {
      this.clearRefreshCookie(res);
      throw err;
    }
  }

  @Public()
  @RateLimit('refresh')
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.readCookie(req));
    this.clearRefreshCookie(res);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  private meta(req: AppRequest): SessionMeta {
    return { userAgent: req.header('user-agent') ?? undefined, ip: req.ip };
  }

  private readCookie(req: AppRequest): string | undefined {
    const value = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: COOKIE_PATH,
      domain: this.config.env.COOKIE_DOMAIN || undefined,
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, { ...this.cookieOptions(), maxAge: this.tokens.refreshTtlMs });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
