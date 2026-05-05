/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ClusterType, JobStatus } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { WebhookController } from './webhook.controller';
import type { JobCallbackDto } from './dto/job-callback.dto';

describe('WebhookController', () => {
  let prisma: {
    processingJob: {
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    photo: { findMany: jest.Mock; updateMany: jest.Mock };
    cluster: { create: jest.Mock };
    clusterPhoto: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let realtime: jest.Mocked<Partial<RealtimeService>>;
  let controller: WebhookController;

  beforeEach(() => {
    prisma = {
      processingJob: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'job-1',
          roomId: 'room-1',
          status: JobStatus.RUNNING,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'job-1', doneCount: 1, totalCount: 1 }),
      },
      photo: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      cluster: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'cluster-1', title: 'Beach' }),
      },
      clusterPhoto: { createMany: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
        if (typeof fn === 'function')
          return (fn as (tx: unknown) => Promise<unknown>)(prisma);
      }),
    };
    realtime = { emitToRoom: jest.fn() };
    controller = new WebhookController(
      prisma as unknown as PrismaService,
      realtime as RealtimeService,
    );
  });

  it('updates photos with AI results scoped to the job room and marks job SUCCESS', async () => {
    const dto: JobCallbackDto = {
      results: [
        {
          photoId: 'p1',
          sceneLabel: 'beach',
          aiCaption: 'Beach view',
          aiKeywords: ['beach'],
        },
      ],
    };

    await controller.receiveCallback('job-1', dto);

    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', roomId: 'room-1' },
      data: {
        sceneLabel: 'beach',
        aiCaption: 'Beach view',
        aiKeywords: ['beach'],
      },
    });
    expect(prisma.processingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: JobStatus.SUCCESS, doneCount: 1 },
    });
    expect(prisma.processingJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: JobStatus.RUNNING },
      data: { status: JobStatus.PROCESSING_CALLBACK },
    });
  });

  it('is idempotent: skips all updates via atomic claim when job is already SUCCESS', async () => {
    prisma.processingJob.updateMany.mockResolvedValue({ count: 0 }); // claim rejected

    await controller.receiveCallback('job-1', {
      results: [
        {
          photoId: 'p1',
          sceneLabel: 'mountain',
          aiCaption: 'x',
          aiKeywords: [],
        },
      ],
    });

    expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    expect(prisma.processingJob.update).not.toHaveBeenCalled();
  });

  it('creates VLM_SCENE cluster and emits cluster:created when cluster is provided', async () => {
    const dto: JobCallbackDto = {
      results: [],
      cluster: {
        title: 'Beach Day',
        summary: 'Sea walk',
        sceneLabel: 'beach',
        photoIds: ['p1'],
      },
    };

    await controller.receiveCallback('job-1', dto);

    expect(prisma.cluster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clusterType: ClusterType.VLM_SCENE,
        title: 'Beach Day',
        roomId: 'room-1',
      }),
    });
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      'cluster:created',
      expect.any(Object),
    );
  });

  it('rejects cluster photoIds outside the processing job room', async () => {
    prisma.photo.findMany.mockResolvedValue([]);

    await expect(
      controller.receiveCallback('job-1', {
        results: [],
        cluster: {
          title: 'Wrong Room',
          summary: 'Cross-room photo',
          sceneLabel: 'beach',
          photoIds: ['p-other'],
        },
      }),
    ).rejects.toThrow(
      'Cluster photoIds must belong to the processing job room',
    );

    expect(prisma.cluster.create).not.toHaveBeenCalled();
    expect(prisma.clusterPhoto.createMany).not.toHaveBeenCalled();
  });

  it('emits photo:processing_progress with SUCCESS status after job completes', async () => {
    await controller.receiveCallback('job-1', { results: [] });

    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      'photo:processing_progress',
      expect.objectContaining({ jobId: 'job-1', status: 'SUCCESS' }),
    );
  });
});
