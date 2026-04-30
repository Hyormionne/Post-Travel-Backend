import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { RoomRole } from 'generated/prisma/client';
import { RoomsService } from 'src/modules/rooms/rooms.service';
import { AuthenticatedUser } from 'src/common/decorators/current-user.decorator';

@Injectable()
export class RoomOwnerGuard implements CanActivate {
  constructor(private readonly rooms: RoomsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const roomId =
      (req.params?.roomId as string | undefined) ??
      (req.query?.roomId as string | undefined) ??
      (req.body?.roomId as string | undefined);

    if (!roomId || !req.user?.id) throw new ForbiddenException();
    const role = await this.rooms.getRole(roomId, req.user.id);
    if (role !== RoomRole.OWNER) throw new ForbiddenException('Room owner required');
    return true;
  }
}
