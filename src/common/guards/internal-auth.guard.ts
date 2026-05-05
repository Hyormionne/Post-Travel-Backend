import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppEnv } from 'src/config/config.types';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppEnv>) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.headers['x-internal-token'];
    const expected = this.config.getOrThrow<string>('GPU_INTERNAL_TOKEN');
    if (token !== expected)
      throw new UnauthorizedException('Invalid internal token');
    return true;
  }
}
