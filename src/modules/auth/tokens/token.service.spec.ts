import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/redis/redis.service';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const config = {
    getOrThrow: (key: string) =>
      (
        ({
          JWT_ACCESS_SECRET: 'access-secret-'.padEnd(32, 'x'),
          JWT_REFRESH_SECRET: 'refresh-secret-'.padEnd(32, 'y'),
          JWT_ACCESS_EXPIRES: '1h',
          JWT_REFRESH_EXPIRES: '14d',
        }) as Record<string, string>
      )[key],
  } as unknown as ConfigService;

  const redis = {
    setex: jest.fn(),
    exists: jest.fn(),
  } as unknown as RedisService;

  const jwt = new JwtService({});
  const service = new TokenService(jwt, config, redis);

  it('issueAccessToken signs a payload with access secret', async () => {
    const token = await service.issueAccessToken({
      sub: 'u1',
      email: 'a@b.com',
    });
    const decoded = jwt.verify<{ sub: string }>(token, {
      secret: 'access-secret-'.padEnd(32, 'x'),
    });
    expect(decoded.sub).toBe('u1');
  });

  it('issueRefreshToken signs with refresh secret and includes jti', async () => {
    const { token, jti } = await service.issueRefreshToken({
      sub: 'u1',
      email: 'a@b.com',
    });
    expect(typeof jti).toBe('string');
    const decoded = jwt.verify<{ sub: string; jti: string }>(token, {
      secret: 'refresh-secret-'.padEnd(32, 'y'),
    });
    expect(decoded.sub).toBe('u1');
    expect(decoded.jti).toBe(jti);
  });

  it('blacklistRefresh stores jti in redis with TTL', async () => {
    await service.blacklistRefresh('jti-1', 3600);
    expect(jest.mocked(redis.setex)).toHaveBeenCalledWith(
      'refresh:blacklist:jti-1',
      3600,
      '1',
    );
  });

  it('isRefreshBlacklisted checks redis', async () => {
    (redis.exists as jest.Mock).mockResolvedValue(true);
    const result = await service.isRefreshBlacklisted('jti-2');
    expect(jest.mocked(redis.exists)).toHaveBeenCalledWith(
      'refresh:blacklist:jti-2',
    );
    expect(result).toBe(true);
  });
});
