import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BlogsService } from 'src/modules/blogs/blogs.service';
import { BlogAuthorGuard } from './blog-author.guard';

function makeCtx(
  userId: string | undefined,
  blogId: string | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: userId ? { id: userId, email: 'u@test.com' } : undefined,
        params: { id: blogId },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('BlogAuthorGuard', () => {
  let blogs: jest.Mocked<Pick<BlogsService, 'findBlogMeta'>>;
  let guard: BlogAuthorGuard;

  beforeEach(() => {
    blogs = {
      findBlogMeta: jest.fn(),
    };
    guard = new BlogAuthorGuard(blogs as unknown as BlogsService);
  });

  it('allows the blog author', async () => {
    blogs.findBlogMeta.mockResolvedValue({
      authorId: 'user-1',
      roomId: 'room-1',
    });

    await expect(guard.canActivate(makeCtx('user-1', 'blog-1'))).resolves.toBe(
      true,
    );
  });

  it('throws ForbiddenException for non-author', async () => {
    blogs.findBlogMeta.mockResolvedValue({
      authorId: 'user-1',
      roomId: 'room-1',
    });

    await expect(
      guard.canActivate(makeCtx('user-other', 'blog-1')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when blog not found', async () => {
    blogs.findBlogMeta.mockResolvedValue(null);

    await expect(
      guard.canActivate(makeCtx('user-1', 'blog-1')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when no blogId in params', async () => {
    await expect(
      guard.canActivate(makeCtx('user-1', undefined)),
    ).rejects.toThrow(ForbiddenException);
  });
});
