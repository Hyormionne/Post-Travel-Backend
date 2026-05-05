import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from 'src/config/config.types';
import { JobStatus } from 'generated/prisma/client';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { StalledJobScheduler } from './stalled-job.scheduler';

describe('StalledJobScheduler', () => {
  let prisma: { processingJob: { findMany: jest.Mock; update: jest.Mock } };
  let realtime: jest.Mocked<Partial<RealtimeService>>;
  let config: jest.Mocked<Partial<ConfigService<AppEnv>>>;
  let scheduler: StalledJobScheduler;

  beforeEach(() => {
    prisma = {
      processingJob: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    realtime = { emitToRoom: jest.fn() };
    config = { getOrThrow: jest.fn().mockReturnValue(300_000) };
    scheduler = new StalledJobScheduler(
      prisma as unknown as PrismaService,
      realtime as RealtimeService,
      config as unknown as ConfigService<AppEnv>,
    );
  });

  it('marks RUNNING jobs older than JOB_STALL_TIMEOUT_MS as FAILED', async () => {
    prisma.processingJob.findMany.mockResolvedValue([
      { id: 'job-1', roomId: 'room-1' },
    ]);

    await scheduler.reconcile();

    expect(prisma.processingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: JobStatus.FAILED, errorMsg: 'timeout (stalled)' },
    });
  });

  it('emits photo:processing_progress FAILED event for each stalled job', async () => {
    prisma.processingJob.findMany.mockResolvedValue([
      { id: 'job-1', roomId: 'room-1' },
    ]);

    await scheduler.reconcile();

    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      'photo:processing_progress',
      expect.objectContaining({ jobId: 'job-1', status: 'FAILED' }),
    );
  });

  it('does nothing when no stalled jobs exist', async () => {
    await scheduler.reconcile();
    expect(prisma.processingJob.update).not.toHaveBeenCalled();
  });

  it('queries RUNNING and PROCESSING_CALLBACK jobs older than the timeout', async () => {
    const before = Date.now();
    await scheduler.reconcile();
    const after = Date.now();

    const callArg = (
      prisma.processingJob.findMany.mock.calls[0] as unknown[]
    )[0] as {
      where: { status: { in: string[] }; updatedAt: { lt: Date } };
    };
    expect(callArg.where.status.in).toEqual([
      JobStatus.RUNNING,
      JobStatus.PROCESSING_CALLBACK,
    ]);
    const cutoff = callArg.where.updatedAt.lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - 300_000);
    expect(cutoff).toBeLessThanOrEqual(after - 300_000 + 100);
  });
});
