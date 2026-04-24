import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-jwt';

export const REFRESH_COOKIE_NAME = 'refresh_token';

function extractFromCookie(req: Request): string | null {
  const value: unknown = req.cookies[REFRESH_COOKIE_NAME];
  return typeof value === 'string' ? value : null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractFromCookie,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: { sub: string; email: string; jti: string }) {
    const token = extractFromCookie(req);
    if (!token) throw new UnauthorizedException('Refresh token missing');
    return { id: payload.sub, email: payload.email, jti: payload.jti, token };
  }
}
