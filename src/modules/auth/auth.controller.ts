import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { JwtRefreshGuard } from './guards/refresh-jwt.guard';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { GoogleTokenDto } from './dto/google-token.dto';

const TOKEN_PAIR_EXAMPLE = {
  accessToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIiwiaWF0IjoxNzAwMDAwMDAwfQ.signature',
  refreshToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIiwianRpIjoianRpLWlkIn0.signature',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({ summary: '이메일 회원가입' })
  @ApiResponse({
    status: 201,
    description: '회원가입 성공',
    schema: { example: TOKEN_PAIR_EXAMPLE },
  })
  @ApiResponse({ status: 409, description: '이미 존재하는 이메일' })
  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @ApiOperation({ summary: '이메일 로그인' })
  @ApiResponse({
    status: 200,
    description: '로그인 성공',
    schema: { example: TOKEN_PAIR_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: '이메일 또는 비밀번호 불일치' })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiOperation({
    summary: 'Access token 재발급 (Authorization: Bearer <refreshToken>)',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: '토큰 재발급 성공',
    schema: { example: TOKEN_PAIR_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: '유효하지 않은 refresh token' })
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Req() req: Request) {
    const token = (req.user as { token: string }).token;
    return this.auth.refresh(token);
  }

  @ApiOperation({
    summary: '로그아웃 (Authorization: Bearer <refreshToken>)',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: '로그아웃 성공' })
  @ApiResponse({ status: 401, description: '유효하지 않은 refresh token' })
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request) {
    const token = (req.user as { token: string }).token;
    await this.auth.logout(token);
  }

  @ApiOperation({ summary: 'Google 로그인 (React Native용, idToken 검증)' })
  @ApiResponse({
    status: 200,
    description: '로그인 성공',
    schema: { example: TOKEN_PAIR_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: '유효하지 않은 Google idToken' })
  @Public()
  @Post('google/token')
  @HttpCode(HttpStatus.OK)
  googleToken(@Body() dto: GoogleTokenDto) {
    return this.auth.loginWithGoogleIdToken(dto.idToken);
  }
}
