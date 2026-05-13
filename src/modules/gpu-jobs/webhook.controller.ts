import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';
import { InternalAuthGuard } from 'src/common/guards/internal-auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import {
  BlogVisibility,
  ClusterType,
  JobStatus,
} from 'generated/prisma/client';
import { BlogCallbackDto, JobCallbackDto } from './dto/job-callback.dto';

@ApiTags('internal')
@ApiHeader({
  name: 'X-Internal-Token',
  description: 'GPU 서버 내부 인증 토큰',
  required: true,
})
@Controller('internal/jobs')
export class WebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  @ApiOperation({ summary: 'GPU 작업 결과 콜백 수신 (GPU 서버 전용)' })
  @ApiResponse({
    status: 201,
    description: '처리 완료',
    schema: { example: {} },
  })
  @ApiResponse({
    status: 401,
    description: 'X-Internal-Token 불일치',
    schema: { example: { statusCode: 401, message: 'Invalid internal token' } },
  })
  @Public()
  @UseGuards(InternalAuthGuard)
  @Post(':jobId/callback')
  async receiveCallback(
    @Param('jobId') jobId: string,
    @Body() dto: JobCallbackDto,
  ): Promise<void> {
    const processingJob = await this.prisma.processingJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    const claimed = await this.prisma.processingJob.updateMany({
      where: { id: jobId, status: JobStatus.RUNNING },
      data: { status: JobStatus.PROCESSING_CALLBACK },
    });
    if (claimed.count === 0) return;

    try {
      await Promise.all(
        dto.results.map((r) =>
          this.prisma.photo.updateMany({
            where: { id: r.photoId, roomId: processingJob.roomId },
            data: {
              sceneLabel: r.sceneLabel,
              aiCaption: r.aiCaption,
              aiKeywords: r.aiKeywords,
            },
          }),
        ),
      );

      if (dto.cluster && dto.cluster.photoIds.length > 0) {
        const clusterDto = dto.cluster;
        const uniquePhotoIds = [...new Set(clusterDto.photoIds)];
        const roomPhotos = await this.prisma.photo.findMany({
          where: { id: { in: uniquePhotoIds }, roomId: processingJob.roomId },
          select: { id: true },
        });
        if (roomPhotos.length !== uniquePhotoIds.length) {
          throw new BadRequestException(
            'Cluster photoIds must belong to the processing job room',
          );
        }

        await this.prisma.$transaction(async (tx) => {
          const cluster = await tx.cluster.create({
            data: {
              roomId: processingJob.roomId,
              title: clusterDto.title,
              summary: clusterDto.summary,
              sceneLabel: clusterDto.sceneLabel,
              clusterType: ClusterType.VLM_SCENE,
            },
          });
          await tx.clusterPhoto.createMany({
            data: uniquePhotoIds.map((photoId) => ({
              clusterId: cluster.id,
              photoId,
            })),
          });
          this.realtime.emitToRoom(processingJob.roomId, 'cluster:created', {
            clusterId: cluster.id,
            title: cluster.title,
          });
        });
      }

      const updated = await this.prisma.processingJob.update({
        where: { id: jobId },
        data: { status: JobStatus.SUCCESS, doneCount: dto.results.length },
      });

      this.realtime.emitToRoom(
        processingJob.roomId,
        'photo:processing_progress',
        {
          jobId,
          doneCount: updated.doneCount,
          totalCount: updated.totalCount,
          status: 'SUCCESS',
        },
      );
    } catch (err) {
      await this.prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          errorMsg: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  @ApiOperation({ summary: 'AI 블로그 생성 결과 콜백 수신 (GPU 서버 전용)' })
  @ApiResponse({
    status: 201,
    description: '처리 완료',
    schema: { example: {} },
  })
  @Public()
  @UseGuards(InternalAuthGuard)
  @Post(':jobId/blog-callback')
  async receiveBlogCallback(
    @Param('jobId') jobId: string,
    @Body() dto: BlogCallbackDto,
  ): Promise<void> {
    const processingJob = await this.prisma.processingJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    const claimed = await this.prisma.processingJob.updateMany({
      where: { id: jobId, status: JobStatus.RUNNING },
      data: { status: JobStatus.PROCESSING_CALLBACK },
    });
    if (claimed.count === 0) return;

    try {
      if (!processingJob.requestedBy) {
        throw new BadRequestException('Blog job is missing requestedBy');
      }

      const photoIds = dto.sections.flatMap((s) => s.photoIds);
      const uniquePhotoIds = [...new Set(photoIds)];
      if (uniquePhotoIds.length !== photoIds.length) {
        throw new BadRequestException('Blog section photoIds must be unique');
      }

      const roomPhotos = await this.prisma.photo.findMany({
        where: { id: { in: uniquePhotoIds }, roomId: processingJob.roomId },
        select: { id: true },
      });
      if (roomPhotos.length !== uniquePhotoIds.length) {
        throw new BadRequestException(
          'Blog photoIds must belong to the processing job room',
        );
      }

      const content = [dto.summary, ...dto.sections.map((s) => s.text)]
        .filter(Boolean)
        .join('\n\n');

      const blog = await this.prisma.$transaction(async (tx) => {
        const created = await tx.blog.create({
          data: {
            roomId: processingJob.roomId,
            authorId: processingJob.requestedBy!,
            title: dto.title,
            content,
            visibility: BlogVisibility.ROOM,
          },
        });
        if (uniquePhotoIds.length > 0) {
          await tx.blogPhoto.createMany({
            data: uniquePhotoIds.map((photoId, idx) => ({
              blogId: created.id,
              photoId,
              orderIdx: idx,
            })),
          });
        }
        return created;
      });

      await this.prisma.processingJob.update({
        where: { id: jobId },
        data: { status: JobStatus.SUCCESS, doneCount: uniquePhotoIds.length },
      });

      this.realtime.emitToRoom(processingJob.roomId, 'blog:generated', {
        jobId,
        blogId: blog.id,
      });
    } catch (err) {
      await this.prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          errorMsg: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }
}
