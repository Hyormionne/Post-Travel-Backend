import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { BlogsService } from 'src/modules/blogs/blogs.service';
import type { AuthenticatedUser } from 'src/common/decorators/current-user.decorator';

@Injectable()
export class BlogAuthorGuard implements CanActivate {
  constructor(private readonly blogs: BlogsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    const blogId = req.params?.id as string | undefined;
    if (!blogId || !req.user?.id) throw new ForbiddenException();

    const meta = await this.blogs.findBlogMeta(blogId);
    if (!meta) throw new ForbiddenException();
    if (meta.authorId !== req.user.id)
      throw new ForbiddenException('Not the blog author');
    return true;
  }
}
