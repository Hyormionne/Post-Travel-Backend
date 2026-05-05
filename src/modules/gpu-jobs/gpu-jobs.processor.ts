import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { JobStatus } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { GpuServerClient } from './gpu-server.client';
import { GPU_JOBS_QUEUE } from './gpu-jobs.types';
import type { GpuJobPayload } from './gpu-jobs.types';
import type { AppEnv } from 'src/config/config.types';

const PHOTO_URL_TTL = 3_600;

@Processor(GPU_JOBS_QUEUE, { stalledInterval: 30_000, maxStalledCount: 1 })
export class GpuJobsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly gpuClient: GpuServerClient,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService<AppEnv>,
  ) {
    super();
  }

  async process(job: Job<GpuJobPayload>): Promise<void> {
    const { processingJobId, roomId, photoIds } = job.data;

    await this.prisma.processingJob.update({
      where: { id: processingJobId },
      data: { status: JobStatus.RUNNING },
    });

    try {
      const photos = await this.prisma.photo.findMany({
        where: { id: { in: photoIds }, roomId },
        select: { id: true, s3Key: true },
      });

      const photosWithUrls = await Promise.all(
        photos.map(async (p) => ({
          photo_id: p.id,
          url: await this.s3.getPresignedGetUrl(p.s3Key, PHOTO_URL_TTL),
        })),
      );

      const callbackBase = this.config.getOrThrow<string>('CALLBACK_BASE_URL');
      await this.gpuClient.callVlmAnalyze({
        job_id: processingJobId,
        photos: photosWithUrls,
        callback_url: `${callbackBase}/internal/jobs/${processingJobId}/callback`,
      });

      this.realtime.emitToRoom(roomId, 'photo:processing_progress', {
        jobId: processingJobId,
        doneCount: 0,
        totalCount: photoIds.length,
      });
    } catch (err) {
      await this.prisma.processingJob.update({
        where: { id: processingJobId },
        data: {
          status: JobStatus.FAILED,
          errorMsg: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }
}
