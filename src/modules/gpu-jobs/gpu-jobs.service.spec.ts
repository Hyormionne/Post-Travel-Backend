/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from 'src/prisma/prisma.service';
import { Queue } from 'bullmq';
import { JobStatus, JobType } from 'generated/prisma/client';
import { GpuJobsService } from './gpu-jobs.service';

describe('GpuJobsService', () => {
  let prisma: { processingJob: { create: jest.Mock; findMany: jest.Mock } };
  let queue: jest.Mocked<Partial<Queue>>;
  let service: GpuJobsService;

  beforeEach(() => {
    prisma = {
      processingJob: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    queue = { add: jest.fn().mockResolvedValue({}) };
    service = new GpuJobsService(
      prisma as unknown as PrismaService,
      queue as unknown as Queue,
    );
  });

  it('enqueueVlmJob creates ProcessingJob with PENDING status then enqueues BullMQ job', async () => {
    const mockJob = {
      id: 'job-1',
      roomId: 'room-1',
      status: JobStatus.PENDING,
      totalCount: 2,
    };
    prisma.processingJob.create.mockResolvedValue(mockJob);

    const result = await service.enqueueVlmJob('room-1', ['p1', 'p2']);

    expect(prisma.processingJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roomId: 'room-1',
        jobType: JobType.VLM_ANALYZE,
        totalCount: 2,
        status: JobStatus.PENDING,
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'vlm-analyze',
      expect.objectContaining({
        processingJobId: 'job-1',
        roomId: 'room-1',
        photoIds: ['p1', 'p2'],
      }),
      expect.objectContaining({ attempts: 3 }),
    );
    expect(result).toEqual(mockJob);
  });

  it('enqueueBlogJob creates LLM_BLOG_DRAFT job for the requesting author', async () => {
    const mockJob = {
      id: 'job-blog',
      roomId: 'room-1',
      status: JobStatus.PENDING,
      totalCount: 2,
      requestedBy: 'user-1',
    };
    prisma.processingJob.create.mockResolvedValue(mockJob);

    const result = await service.enqueueBlogJob({
      roomId: 'room-1',
      authorId: 'user-1',
      photoIds: ['p1', 'p2'],
      persona: 'witty',
    });

    expect(prisma.processingJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roomId: 'room-1',
        requestedBy: 'user-1',
        jobType: JobType.LLM_BLOG_DRAFT,
        totalCount: 2,
        status: JobStatus.PENDING,
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'blog-generate',
      expect.objectContaining({
        processingJobId: 'job-blog',
        roomId: 'room-1',
        photoIds: ['p1', 'p2'],
        persona: 'witty',
      }),
      expect.objectContaining({ attempts: 3 }),
    );
    expect(result).toEqual(mockJob);
  });

  it('findByRoom returns jobs ordered by createdAt desc', async () => {
    prisma.processingJob.findMany.mockResolvedValue([
      { id: 'j1' },
      { id: 'j2' },
    ]);

    const result = await service.findByRoom('room-1');

    expect(prisma.processingJob.findMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(2);
  });
});
