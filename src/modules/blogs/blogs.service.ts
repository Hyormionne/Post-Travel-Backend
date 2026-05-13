import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { GpuJobsService } from 'src/modules/gpu-jobs/gpu-jobs.service';
import { Blog, BlogVisibility, JobStatus } from 'generated/prisma/client';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import type { GenerateBlogDto } from './dto/generate-blog.dto';

const PHOTO_URL_TTL = 86_400;

type BlogPhotoItem = {
  photoId: string;
  orderIdx: number;
  url: string;
  thumbnailUrl: string | null;
};
export type BlogWithPhotoUrls = Blog & { photos: BlogPhotoItem[] };
export type BlogMeta = { authorId: string; roomId: string };
export type BlogGenerationJob = { jobId: string; status: JobStatus };

@Injectable()
export class BlogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly realtime: RealtimeService,
    private readonly gpuJobs: GpuJobsService,
  ) {}

  async create(
    authorId: string,
    dto: CreateBlogDto,
  ): Promise<BlogWithPhotoUrls> {
    const photoIds = dto.photoIds ?? [];
    const created = await this.prisma.$transaction(async (tx) => {
      const blog = await tx.blog.create({
        data: {
          roomId: dto.roomId,
          authorId,
          title: dto.title,
          content: dto.content,
          visibility: BlogVisibility.ROOM,
        },
      });
      if (photoIds.length > 0) {
        await tx.blogPhoto.createMany({
          data: photoIds.map((photoId, idx) => ({
            blogId: blog.id,
            photoId,
            orderIdx: idx,
          })),
        });
      }
      return blog;
    });
    return this.fetchWithPhotos(created);
  }

  async findByRoom(roomId: string): Promise<BlogWithPhotoUrls[]> {
    const blogs = await this.prisma.blog.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(blogs.map((b) => this.fetchWithPhotos(b)));
  }

  async findOne(blogId: string): Promise<BlogWithPhotoUrls> {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog not found');
    return this.fetchWithPhotos(blog);
  }

  async generateFromRoom(
    roomId: string,
    authorId: string,
    dto: GenerateBlogDto = {},
  ): Promise<BlogGenerationJob> {
    const requestedPhotoIds = dto.photoIds
      ? [...new Set(dto.photoIds)]
      : undefined;
    const photos = await this.prisma.photo.findMany({
      where: {
        roomId,
        ...(requestedPhotoIds ? { id: { in: requestedPhotoIds } } : {}),
      },
      select: { id: true },
      orderBy: [{ takenAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (requestedPhotoIds && photos.length !== requestedPhotoIds.length) {
      throw new BadRequestException('Photo ids must belong to the room');
    }
    if (photos.length === 0) {
      throw new BadRequestException('At least one photo is required');
    }

    const job = await this.gpuJobs.enqueueBlogJob({
      roomId,
      authorId,
      photoIds: photos.map((p) => p.id),
      persona: dto.persona,
    });

    return { jobId: job.id, status: job.status };
  }

  async update(blogId: string, dto: UpdateBlogDto): Promise<BlogWithPhotoUrls> {
    const data: Partial<{ title: string; content: string }> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.blog.updateMany({ where: { id: blogId }, data });
      if (updated.count === 0) throw new NotFoundException('Blog not found');
      if (dto.photoIds !== undefined) {
        await tx.blogPhoto.deleteMany({ where: { blogId } });
        if (dto.photoIds.length > 0) {
          await tx.blogPhoto.createMany({
            data: dto.photoIds.map((photoId, idx) => ({
              blogId,
              photoId,
              orderIdx: idx,
            })),
          });
        }
      }
    });

    const blog = await this.prisma.blog.findUniqueOrThrow({
      where: { id: blogId },
    });
    const result = await this.fetchWithPhotos(blog);
    this.realtime.emitToRoom(blog.roomId, 'blog:updated', { blogId });
    return result;
  }

  async publish(blogId: string): Promise<Blog> {
    const updated = await this.prisma.blog.updateMany({
      where: { id: blogId },
      data: { publishedAt: new Date() },
    });
    if (updated.count === 0) throw new NotFoundException('Blog not found');
    const blog = await this.prisma.blog.findUniqueOrThrow({
      where: { id: blogId },
    });
    this.realtime.emitToRoom(blog.roomId, 'blog:published', { blogId });
    return blog;
  }

  async remove(blogId: string): Promise<void> {
    const result = await this.prisma.blog.deleteMany({ where: { id: blogId } });
    if (result.count === 0) throw new NotFoundException('Blog not found');
  }

  async findBlogMeta(blogId: string): Promise<BlogMeta | null> {
    return this.prisma.blog.findUnique({
      where: { id: blogId },
      select: { authorId: true, roomId: true },
    });
  }

  private async fetchWithPhotos(blog: Blog): Promise<BlogWithPhotoUrls> {
    const records = await this.prisma.blogPhoto.findMany({
      where: { blogId: blog.id },
      include: { photo: true },
      orderBy: { orderIdx: 'asc' },
    });
    const photos = await Promise.all(
      records.map(async (r) => ({
        photoId: r.photoId,
        orderIdx: r.orderIdx,
        url: await this.s3.getPresignedGetUrl(r.photo.s3Key, PHOTO_URL_TTL),
        thumbnailUrl: r.photo.thumbnailKey
          ? await this.s3.getPresignedGetUrl(
              r.photo.thumbnailKey,
              PHOTO_URL_TTL,
            )
          : null,
      })),
    );
    return { ...blog, photos };
  }
}
