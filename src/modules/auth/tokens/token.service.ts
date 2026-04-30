import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { RedisService } from 'src/redis/redis.service';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface RefreshJwtPayload extends JwtPayload {
  jti: string;
  exp: number;
  iat: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  issueAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>(
        'JWT_ACCESS_EXPIRES',
      ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
  }

  async issueRefreshToken(
    payload: JwtPayload,
  ): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const token = await this.jwt.signAsync(
      { ...payload, jti },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow<string>(
          'JWT_REFRESH_EXPIRES',
        ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );
    return { token, jti };
  }

  verifyRefreshToken(token: string): Promise<RefreshJwtPayload> {
    return this.jwt.verifyAsync<RefreshJwtPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }

  blacklistRefresh(jti: string, ttlSeconds: number) {
    return this.redis.setex(this.key(jti), ttlSeconds, '1');
  }

  isRefreshBlacklisted(jti: string): Promise<boolean> {
    return this.redis.exists(this.key(jti));
  }

  private key(jti: string): string {
    return `refresh:blacklist:${jti}`;
  }
}
