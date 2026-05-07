import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { BlogsService } from 'src/modules/blogs/blogs.service';
import { RoomsService } from 'src/modules/rooms/rooms.service';
import type { AuthenticatedUser } from 'src/common/decorators/current-user.decorator';

@Injectable()
export class BlogAccessGuard implements CanActivate {
  constructor(
    private readonly blogs: BlogsService,
    private readonly rooms: RoomsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    const blogId = req.params?.id as string | undefined;
    if (!blogId || !req.user?.id) throw new ForbiddenException();

    const meta = await this.blogs.findBlogMeta(blogId);
    if (!meta) throw new ForbiddenException();

    const isMember = await this.rooms.isMember(meta.roomId, req.user.id);
    if (!isMember) throw new ForbiddenException('Not a room member');
    return true;
  }
}
