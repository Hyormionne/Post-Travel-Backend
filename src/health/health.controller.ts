import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @ApiOperation({ summary: '서버 상태 확인' })
  @ApiResponse({
    status: 200,
    description: '정상',
    schema: { example: { status: 'ok', db: 'up', redis: 'up' } },
  })
  @ApiResponse({
    status: 503,
    description: 'DB 또는 Redis 장애',
    schema: { example: { status: 'degraded', db: 'down', redis: 'up' } },
  })
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const db = await this.prisma.$queryRaw`SELECT 1`
      .then(() => 'up' as const)
      .catch(() => 'down' as const);
    const redis = await this.redis.ping().then((ok) => (ok ? 'up' : 'down'));
    const status = db === 'up' && redis === 'up' ? 'ok' : 'degraded';
    if (status === 'degraded') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status, db, redis };
  }
}
