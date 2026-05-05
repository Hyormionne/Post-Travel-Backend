import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { JobStatus } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import type { AppEnv } from 'src/config/config.types';

@Injectable()
export class StalledJobScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService<AppEnv>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcile(): Promise<void> {
    const timeoutMs = this.config.getOrThrow<number>('JOB_STALL_TIMEOUT_MS');
    const cutoff = new Date(Date.now() - timeoutMs);

    const stalled = await this.prisma.processingJob.findMany({
      where: {
        status: {
          in: [JobStatus.RUNNING, JobStatus.PROCESSING_CALLBACK],
        },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, roomId: true },
    });

    await Promise.all(
      stalled.map(async (job) => {
        await this.prisma.processingJob.update({
          where: { id: job.id },
          data: { status: JobStatus.FAILED, errorMsg: 'timeout (stalled)' },
        });
        this.realtime.emitToRoom(job.roomId, 'photo:processing_progress', {
          jobId: job.id,
          status: 'FAILED',
          error: 'timeout (stalled)',
        });
      }),
    );
  }
}
