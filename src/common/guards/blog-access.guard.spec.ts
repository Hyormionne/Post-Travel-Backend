import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BlogsService } from 'src/modules/blogs/blogs.service';
import { RoomsService } from 'src/modules/rooms/rooms.service';
import { BlogAccessGuard } from './blog-access.guard';

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

describe('BlogAccessGuard', () => {
  let blogs: jest.Mocked<Pick<BlogsService, 'findBlogMeta'>>;
  let rooms: jest.Mocked<Pick<RoomsService, 'isMember'>>;
  let guard: BlogAccessGuard;

  beforeEach(() => {
    blogs = {
      findBlogMeta: jest.fn(),
    };
    rooms = {
      isMember: jest.fn(),
    };
    guard = new BlogAccessGuard(
      blogs as unknown as BlogsService,
      rooms as unknown as RoomsService,
    );
  });

  it('allows a room member to access the blog', async () => {
    blogs.findBlogMeta.mockResolvedValue({
      authorId: 'user-1',
      roomId: 'room-1',
    });
    rooms.isMember.mockResolvedValue(true);

    await expect(guard.canActivate(makeCtx('user-2', 'blog-1'))).resolves.toBe(
      true,
    );
    expect(rooms.isMember).toHaveBeenCalledWith('room-1', 'user-2');
  });

  it('throws ForbiddenException for non-member', async () => {
    blogs.findBlogMeta.mockResolvedValue({
      authorId: 'user-1',
      roomId: 'room-1',
    });
    rooms.isMember.mockResolvedValue(false);

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
