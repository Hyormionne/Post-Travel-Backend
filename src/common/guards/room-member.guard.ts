import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { RoomsService } from 'src/modules/rooms/rooms.service';
import { AuthenticatedUser } from 'src/common/decorators/current-user.decorator';

@Injectable()
export class RoomMemberGuard implements CanActivate {
  constructor(private readonly rooms: RoomsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    const body = req.body as Record<string, unknown>;
    const roomId =
      (req.params?.roomId as string | undefined) ??
      (req.query?.roomId as string | undefined) ??
      (body.roomId as string | undefined);

    if (!roomId || !req.user?.id) throw new ForbiddenException();
    const isMember = await this.rooms.isMember(roomId, req.user.id);
    if (!isMember) throw new ForbiddenException('Not a room member');
    return true;
  }
}
