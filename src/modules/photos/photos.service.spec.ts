/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from 'src/prisma/prisma.service';
import { ClustersService } from 'src/modules/clusters/clusters.service';
import { S3Service } from 'src/s3/s3.service';
import { GpuJobsService } from 'src/modules/gpu-jobs/gpu-jobs.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { PhotosService } from './photos.service';

describe('PhotosService', () => {
  let prisma: {
    photo: {
      createMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };
  let s3: jest.Mocked<Partial<S3Service>>;
  let clusters: jest.Mocked<Partial<ClustersService>>;
  let gpuJobs: jest.Mocked<Partial<GpuJobsService>>;
  let realtime: jest.Mocked<Partial<RealtimeService>>;
  let service: PhotosService;

  beforeEach(() => {
    prisma = {
      photo: {
        createMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    s3 = {
      createPresignedPutUrl: jest
        .fn()
        .mockResolvedValue('https://s3.test/upload?X-Amz-Signature=abc'),
      getPresignedGetUrl: jest
        .fn()
        .mockResolvedValue('https://signed.test/photo'),
    };
    clusters = { rebuildForRoom: jest.fn().mockResolvedValue([]) };
    gpuJobs = {
      enqueueVlmJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    };
    realtime = { emitToRoom: jest.fn() };
    service = new PhotosService(
      prisma as unknown as PrismaService,
      s3 as S3Service,
      clusters as ClustersService,
      gpuJobs as GpuJobsService,
      realtime as RealtimeService,
    );
  });

  it('generatePresignedUrls returns one item per file', async () => {
    const result = await service.generatePresignedUrls('room-1', [
      { name: 'photo.jpg', size: 1024, contentType: 'image/jpeg' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      photoId: expect.any(String),
      original: {
        url: 'https://s3.test/upload?X-Amz-Signature=abc',
        key: expect.any(String),
      },
      thumbnail: {
        url: 'https://s3.test/upload?X-Amz-Signature=abc',
        key: expect.any(String),
      },
    });
    expect(s3.createPresignedPutUrl).toHaveBeenCalledTimes(2);
  });

  it('complete creates photo records, triggers clustering, and enqueues VLM job (fire-and-forget)', async () => {
    prisma.photo.createMany.mockResolvedValue({ count: 1 });
    prisma.photo.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'p1',
          takenAt: new Date('2025-07-15T09:00:00Z'),
          lat: null,
          lng: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'p1', s3Key: 'rooms/room-1/photos/p1.jpg', thumbnailKey: null },
      ]);

    await service.complete('room-1', [
      { photoId: 'p1', s3Key: 'rooms/room-1/photos/p1.jpg', fileSize: 1024 },
    ]);

    expect(prisma.photo.createMany).toHaveBeenCalled();
    expect(clusters.rebuildForRoom).toHaveBeenCalledWith(
      'room-1',
      expect.any(Array),
    );
    expect(gpuJobs.enqueueVlmJob).toHaveBeenCalledWith('room-1', ['p1']);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      'photo:uploaded',
      expect.objectContaining({ count: 1 }),
    );
  });

  it('complete returns success even when enqueueVlmJob rejects', async () => {
    gpuJobs.enqueueVlmJob = jest
      .fn()
      .mockRejectedValue(new Error('Queue down'));
    prisma.photo.createMany.mockResolvedValue({ count: 1 });
    prisma.photo.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'p1',
          takenAt: new Date('2025-07-15T09:00:00Z'),
          lat: null,
          lng: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'p1', s3Key: 'rooms/room-1/photos/p1.jpg', thumbnailKey: null },
      ]);

    await expect(
      service.complete('room-1', [
        { photoId: 'p1', s3Key: 'rooms/room-1/photos/p1.jpg', fileSize: 1024 },
      ]),
    ).resolves.not.toThrow();
  });

  it('complete rejects photo ids that already belong to a different room', async () => {
    prisma.photo.findMany.mockResolvedValueOnce([{ id: 'p1' }]);

    await expect(
      service.complete('room-1', [
        { photoId: 'p1', s3Key: 'rooms/room-1/photos/p1.jpg', fileSize: 1024 },
      ]),
    ).rejects.toThrow('Photo ids must belong to the room');

    expect(prisma.photo.createMany).not.toHaveBeenCalled();
    expect(gpuJobs.enqueueVlmJob).not.toHaveBeenCalled();
  });

  it('findByRoom returns photos with url and thumbnailUrl', async () => {
    prisma.photo.findMany.mockResolvedValue([
      {
        id: 'p1',
        s3Key: 'rooms/r1/photos/p1.jpg',
        thumbnailKey: 'rooms/r1/thumbs/p1.jpg',
      },
    ]);

    const result = await service.findByRoom('room-1');

    expect(result[0]).toMatchObject({
      id: 'p1',
      url: 'https://signed.test/photo',
      thumbnailUrl: 'https://signed.test/photo',
    });
  });

  it('findByRoom sets thumbnailUrl to null when thumbnailKey is null', async () => {
    prisma.photo.findMany.mockResolvedValue([
      { id: 'p1', s3Key: 'rooms/r1/photos/p1.jpg', thumbnailKey: null },
    ]);

    const result = await service.findByRoom('room-1');
    expect(result[0].thumbnailUrl).toBeNull();
  });
});
