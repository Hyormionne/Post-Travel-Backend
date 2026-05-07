import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { BlogVisibility } from 'generated/prisma/client';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';

describe('BlogsService', () => {
  let prisma: {
    blog: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    blogPhoto: {
      createMany: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let s3: jest.Mocked<Partial<S3Service>>;
  let realtime: jest.Mocked<Partial<RealtimeService>>;
  let service: BlogsService;

  const BLOG = {
    id: 'blog-1',
    roomId: 'room-1',
    authorId: 'user-1',
    title: 'Day 1',
    content: 'Content',
    visibility: BlogVisibility.ROOM,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      blog: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      blogPhoto: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    s3 = {
      getPresignedGetUrl: jest
        .fn()
        .mockResolvedValue('https://signed.test/photo'),
    };
    realtime = { emitToRoom: jest.fn() };
    service = new BlogsService(
      prisma as unknown as PrismaService,
      s3 as S3Service,
      realtime as RealtimeService,
    );
  });

  describe('create', () => {
    it('creates a blog with photos in a transaction', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.blog.create.mockResolvedValue(BLOG);
      prisma.blogPhoto.createMany.mockResolvedValue({ count: 2 });
      prisma.blogPhoto.findMany.mockResolvedValue([
        {
          photoId: 'p1',
          orderIdx: 0,
          photo: { s3Key: 'k1', thumbnailKey: null },
        },
        {
          photoId: 'p2',
          orderIdx: 1,
          photo: { s3Key: 'k2', thumbnailKey: 't2' },
        },
      ]);

      const dto: CreateBlogDto = {
        roomId: 'room-1',
        title: 'Day 1',
        content: 'Content',
        photoIds: ['p1', 'p2'],
      };
      const result = await service.create('user-1', dto);

      expect(prisma.blog.create).toHaveBeenCalledWith({
        data: {
          roomId: 'room-1',
          authorId: 'user-1',
          title: 'Day 1',
          content: 'Content',
          visibility: BlogVisibility.ROOM,
        },
      });
      expect(prisma.blogPhoto.createMany).toHaveBeenCalledWith({
        data: [
          { blogId: 'blog-1', photoId: 'p1', orderIdx: 0 },
          { blogId: 'blog-1', photoId: 'p2', orderIdx: 1 },
        ],
      });
      expect(result.photos).toHaveLength(2);
      expect(result.photos[1].thumbnailUrl).toBe('https://signed.test/photo');
    });

    it('creates a blog without photos', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.blog.create.mockResolvedValue(BLOG);
      prisma.blogPhoto.findMany.mockResolvedValue([]);

      const dto: CreateBlogDto = {
        roomId: 'room-1',
        title: 'Day 1',
        content: 'Content',
      };
      const result = await service.create('user-1', dto);

      expect(prisma.blogPhoto.createMany).not.toHaveBeenCalled();
      expect(result.photos).toHaveLength(0);
    });
  });

  describe('findByRoom', () => {
    it('returns blogs ordered by createdAt desc', async () => {
      prisma.blog.findMany.mockResolvedValue([BLOG]);
      prisma.blogPhoto.findMany.mockResolvedValue([]);

      const result = await service.findByRoom('room-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('blog-1');
      expect(result[0].photos).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns blog with photo URLs', async () => {
      prisma.blog.findUnique.mockResolvedValue(BLOG);
      prisma.blogPhoto.findMany.mockResolvedValue([
        {
          photoId: 'p1',
          orderIdx: 0,
          photo: { s3Key: 'key1', thumbnailKey: null },
        },
      ]);

      const result = await service.findOne('blog-1');

      expect(result.id).toBe('blog-1');
      expect(result.photos[0].url).toBe('https://signed.test/photo');
      expect(result.photos[0].thumbnailUrl).toBeNull();
    });

    it('throws NotFoundException when blog not found', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-such')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates title and emits blog:updated', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.blog.updateMany.mockResolvedValue({ count: 1 });
      prisma.blog.findUniqueOrThrow.mockResolvedValue(BLOG);
      prisma.blogPhoto.findMany.mockResolvedValue([]);

      await service.update('blog-1', { title: 'New Title' });

      expect(prisma.blog.updateMany).toHaveBeenCalledWith({
        where: { id: 'blog-1' },
        data: { title: 'New Title' },
      });
      expect(realtime.emitToRoom).toHaveBeenCalledWith(
        'room-1',
        'blog:updated',
        { blogId: 'blog-1' },
      );
    });

    it('replaces photos when photoIds provided', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.blog.updateMany.mockResolvedValue({ count: 1 });
      prisma.blogPhoto.deleteMany.mockResolvedValue({ count: 1 });
      prisma.blogPhoto.createMany.mockResolvedValue({ count: 1 });
      prisma.blog.findUniqueOrThrow.mockResolvedValue(BLOG);
      prisma.blogPhoto.findMany.mockResolvedValue([
        {
          photoId: 'p-new',
          orderIdx: 0,
          photo: { s3Key: 'k-new', thumbnailKey: null },
        },
      ]);

      await service.update('blog-1', { photoIds: ['p-new'] });

      expect(prisma.blogPhoto.deleteMany).toHaveBeenCalledWith({
        where: { blogId: 'blog-1' },
      });
      expect(prisma.blogPhoto.createMany).toHaveBeenCalledWith({
        data: [{ blogId: 'blog-1', photoId: 'p-new', orderIdx: 0 }],
      });
    });

    it('throws NotFoundException when blog not found', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.blog.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.update('no-such', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('skips photo replacement when photoIds is undefined', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.blog.updateMany.mockResolvedValue({ count: 1 });
      prisma.blog.findUniqueOrThrow.mockResolvedValue(BLOG);
      prisma.blogPhoto.findMany.mockResolvedValue([]);

      await service.update('blog-1', { content: 'New content' });

      expect(prisma.blogPhoto.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('sets publishedAt and emits blog:published', async () => {
      prisma.blog.updateMany.mockResolvedValue({ count: 1 });
      prisma.blog.findUniqueOrThrow.mockResolvedValue({
        ...BLOG,
        publishedAt: new Date(),
      });

      const result = await service.publish('blog-1');

      expect(prisma.blog.updateMany).toHaveBeenCalledWith({
        where: { id: 'blog-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ publishedAt: expect.any(Date) }),
      });
      expect(realtime.emitToRoom).toHaveBeenCalledWith(
        'room-1',
        'blog:published',
        { blogId: 'blog-1' },
      );
      expect(result.publishedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when blog not found', async () => {
      prisma.blog.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.publish('no-such')).rejects.toThrow(
        NotFoundException,
      );
      expect(realtime.emitToRoom).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the blog', async () => {
      prisma.blog.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.remove('blog-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when blog not found', async () => {
      prisma.blog.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove('no-such')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBlogMeta', () => {
    it('returns meta for existing blog', async () => {
      prisma.blog.findUnique.mockResolvedValue({
        authorId: 'user-1',
        roomId: 'room-1',
      });

      const result = await service.findBlogMeta('blog-1');

      expect(result).toEqual({ authorId: 'user-1', roomId: 'room-1' });
    });

    it('returns null for non-existent blog', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);

      await expect(service.findBlogMeta('no-blog')).resolves.toBeNull();
    });
  });
});
