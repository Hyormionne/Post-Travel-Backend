import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      // Joi schema coerces REDIS_PORT to number; parseInt guards against misconfiguration
      port: parseInt(String(config.getOrThrow('REDIS_PORT')), 10),
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err: Error) => {
      this.logger.error('Redis client error', err.stack);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  set(key: string, value: string): Promise<'OK'> {
    return this.client.set(key, value);
  }

  setex(key: string, ttlSeconds: number, value: string): Promise<'OK'> {
    return this.client.setex(key, ttlSeconds, value);
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async ping(): Promise<boolean> {
    const pong = await this.client.ping();
    return pong === 'PONG';
  }
}
