import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const client = ctx.switchToWs().getClient<Socket>();
    return typeof (client.data as { userId?: unknown }).userId === 'string';
  }
}
