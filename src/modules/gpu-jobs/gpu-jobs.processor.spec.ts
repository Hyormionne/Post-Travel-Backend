/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Job } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from 'src/config/config.types';
import { JobStatus } from 'generated/prisma/client';
import { GpuServerClient } from './gpu-server.client';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { GpuJobsProcessor } from './gpu-jobs.processor';

describe('GpuJobsProcessor', () => {
  let prisma: {
    processingJob: { update: jest.Mock };
    photo: { findMany: jest.Mock };
  };
  let s3: jest.Mocked<Partial<S3Service>>;
  let gpuClient: jest.Mocked<Partial<GpuServerClient>>;
  let realtime: jest.Mocked<Partial<RealtimeService>>;
  let config: jest.Mocked<Partial<ConfigService<AppEnv>>>;
  let processor: GpuJobsProcessor;

  beforeEach(() => {
    prisma = {
      processingJob: { update: jest.fn().mockResolvedValue({}) },
      photo: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'p1', s3Key: 'rooms/r1/photos/p1.jpg' }]),
      },
    };
    s3 = {
      getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.test/p1.jpg'),
    };
    gpuClient = {
      callVlmAnalyze: jest.fn().mockResolvedValue(undefined),
      callBlogGenerate: jest.fn().mockResolvedValue(undefined),
    };
    realtime = { emitToRoom: jest.fn() };
    config = { getOrThrow: jest.fn().mockReturnValue('http://localhost:3000') };
    processor = new GpuJobsProcessor(
      prisma as unknown as PrismaService,
      s3 as S3Service,
      gpuClient as GpuServerClient,
      realtime as RealtimeService,
      config as unknown as ConfigService<AppEnv>,
    );
  });

  it('marks job RUNNING before calling GPU server', async () => {
    const job = {
      data: { processingJobId: 'job-1', roomId: 'room-1', photoIds: ['p1'] },
    } as Job;

    await processor.process(job);

    expect(prisma.processingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: JobStatus.RUNNING },
    });
  });

  it('calls GPU server with photo id+url pairs and correct callback URL', async () => {
    const job = {
      data: { processingJobId: 'job-1', roomId: 'room-1', photoIds: ['p1'] },
    } as Job;

    await processor.process(job);

    expect(gpuClient.callVlmAnalyze).toHaveBeenCalledWith({
      job_id: 'job-1',
      photos: [{ photo_id: 'p1', url: 'https://s3.test/p1.jpg' }],
      callback_url: 'http://localhost:3000/internal/jobs/job-1/callback',
    });
  });

  it('marks job FAILED when GPU server call throws', async () => {
    gpuClient.callVlmAnalyze = jest
      .fn()
      .mockRejectedValue(new Error('GPU down'));
    const job = {
      data: { processingJobId: 'job-1', roomId: 'room-1', photoIds: ['p1'] },
    } as Job;

    await expect(processor.process(job)).rejects.toThrow('GPU down');

    expect(prisma.processingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: JobStatus.FAILED, errorMsg: expect.any(String) },
    });
  });

  it('emits photo:processing_progress with doneCount 0 after dispatch', async () => {
    const job = {
      data: { processingJobId: 'job-1', roomId: 'room-1', photoIds: ['p1'] },
    } as Job;

    await processor.process(job);

    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      'photo:processing_progress',
      expect.objectContaining({ jobId: 'job-1', doneCount: 0, totalCount: 1 }),
    );
  });

  it('calls GPU /blog/generate with photo metadata and blog callback URL', async () => {
    const takenAt = new Date('2026-05-11T10:00:00.000Z');
    prisma.photo.findMany.mockResolvedValue([
      {
        id: 'p1',
        s3Key: 'rooms/r1/photos/p1.jpg',
        takenAt,
        lat: 37.5,
        lng: 127.1,
        sceneLabel: 'food',
      },
    ]);
    const job = {
      name: 'blog-generate',
      data: {
        processingJobId: 'job-1',
        roomId: 'room-1',
        photoIds: ['p1'],
        persona: 'witty',
      },
    } as Job;

    await processor.process(job);

    expect(gpuClient.callBlogGenerate).toHaveBeenCalledWith({
      job_id: 'job-1',
      photos: [
        {
          photo_id: 'p1',
          url: 'https://s3.test/p1.jpg',
          taken_at: '2026-05-11T10:00:00.000Z',
          lat: 37.5,
          lng: 127.1,
          scene_label: 'food',
        },
      ],
      callback_url: 'http://localhost:3000/internal/jobs/job-1/blog-callback',
      persona: 'witty',
    });
  });
});
