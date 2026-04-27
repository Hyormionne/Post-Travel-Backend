import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { JwtRefreshGuard } from './guards/refresh-jwt.guard';
import { REFRESH_COOKIE_NAME } from './strategies/jwt-refresh.strategy';
import { GoogleProfilePayload } from './strategies/google.strategy';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ExchangeCodeDto } from './dto/exchange-code.dto';

const ACCESS_TOKEN_EXAMPLE = {
  accessToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIiwiaWF0IjoxNzAwMDAwMDAwfQ.signature',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @ApiOperation({ summary: '이메일 회원가입' })
  @ApiResponse({
    status: 201,
    description: '회원가입 성공 — refresh token은 HttpOnly 쿠키로 설정됨',
    schema: { example: ACCESS_TOKEN_EXAMPLE },
  })
  @ApiResponse({ status: 409, description: '이미 존재하는 이메일' })
  @Public()
  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.signup(dto);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @ApiOperation({ summary: '이메일 로그인' })
  @ApiResponse({
    status: 200,
    description: '로그인 성공 — refresh token은 HttpOnly 쿠키로 설정됨',
    schema: { example: ACCESS_TOKEN_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: '이메일 또는 비밀번호 불일치' })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @ApiOperation({ summary: 'Access token 재발급 (refresh token 쿠키 필요)' })
  @ApiCookieAuth('refresh_token')
  @ApiResponse({
    status: 200,
    description: '토큰 재발급 성공',
    schema: { example: ACCESS_TOKEN_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: '유효하지 않은 refresh token' })
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.user as { token: string }).token;
    const { accessToken, refreshToken } = await this.auth.refresh(token);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @ApiOperation({ summary: '로그아웃 (refresh token 쿠키 필요)' })
  @ApiCookieAuth('refresh_token')
  @ApiResponse({ status: 204, description: '로그아웃 성공' })
  @ApiResponse({ status: 401, description: '유효하지 않은 refresh token' })
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.user as { token: string }).token;
    await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE_NAME);
  }

  @ApiOperation({ summary: 'Google OAuth 로그인 시작 (브라우저 직접 접속)' })
  @ApiResponse({
    status: 302,
    description: 'Google 로그인 페이지로 리다이렉트',
  })
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleRedirect() {
    // Passport redirects to Google automatically
  }

  @ApiOperation({ summary: 'Google OAuth 콜백' })
  @ApiResponse({
    status: 302,
    description:
      '프론트엔드 콜백 URL로 리다이렉트 (1회용 code 쿼리스트링 포함, 30초 유효)',
  })
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as GoogleProfilePayload;
    const code = await this.auth.googleLogin(profile);
    const frontend = this.config.getOrThrow<string>('FRONTEND_URL');
    res.redirect(`${frontend}/auth/callback?code=${code}`);
  }

  @ApiOperation({ summary: 'Google OAuth code → 토큰 교환 (30초 1회용)' })
  @ApiResponse({
    status: 200,
    description: '토큰 교환 성공 — refresh token은 HttpOnly 쿠키로 설정됨',
    schema: { example: ACCESS_TOKEN_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: '코드 만료 또는 이미 사용됨' })
  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeCode(
    @Body() dto: ExchangeCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.exchangeOAuthCode(
      dto.code,
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  private setRefreshCookie(res: Response, token: string) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const expires = this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES');
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/auth',
      maxAge: this.parseTtlMs(expires),
    });
  }

  private parseTtlMs(ttl: string): number {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) return 14 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const multipliers = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * multipliers[match[2] as 's' | 'm' | 'h' | 'd'];
  }
}
