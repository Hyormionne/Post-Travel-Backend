import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { JobStatus, JobType, ProcessingJob } from 'generated/prisma/client';
import { GPU_JOBS_QUEUE } from './gpu-jobs.types';
import type { EnqueueBlogJobInput, GpuJobPayload } from './gpu-jobs.types';

@Injectable()
export class GpuJobsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(GPU_JOBS_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueueVlmJob(
    roomId: string,
    photoIds: string[],
  ): Promise<ProcessingJob> {
    const job = await this.prisma.processingJob.create({
      data: {
        roomId,
        jobType: JobType.VLM_ANALYZE,
        totalCount: photoIds.length,
        status: JobStatus.PENDING,
      },
    });

    const payload: GpuJobPayload = {
      processingJobId: job.id,
      roomId,
      photoIds,
    };

    await this.queue.add('vlm-analyze', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });

    return job;
  }

  async enqueueBlogJob(input: EnqueueBlogJobInput): Promise<ProcessingJob> {
    const job = await this.prisma.processingJob.create({
      data: {
        roomId: input.roomId,
        requestedBy: input.authorId,
        jobType: JobType.LLM_BLOG_DRAFT,
        totalCount: input.photoIds.length,
        status: JobStatus.PENDING,
      },
    });

    const payload: GpuJobPayload = {
      processingJobId: job.id,
      roomId: input.roomId,
      photoIds: input.photoIds,
      persona: input.persona,
    };

    await this.queue.add('blog-generate', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });

    return job;
  }

  async findByRoom(roomId: string): Promise<ProcessingJob[]> {
    return this.prisma.processingJob.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
