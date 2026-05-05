import { PrismaService } from 'src/prisma/prisma.service';
import { ClusterType } from 'generated/prisma/client';
import { S3Service } from 'src/s3/s3.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { ClustersService } from './clusters.service';

describe('ClustersService', () => {
  let prisma: {
    cluster: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
    };
    clusterPhoto: {
      createMany: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let s3: jest.Mocked<Partial<S3Service>>;
  let realtime: jest.Mocked<Partial<RealtimeService>>;
  let service: ClustersService;

  beforeEach(() => {
    prisma = {
      cluster: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
      clusterPhoto: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    s3 = {
      getPresignedGetUrl: jest
        .fn()
        .mockResolvedValue('https://signed.test/photo'),
    };
    realtime = { emitToRoom: jest.fn() };
    service = new ClustersService(
      prisma as unknown as PrismaService,
      s3 as S3Service,
      realtime as RealtimeService,
    );
  });

  it('rebuildForRoom deletes old TIME_GPS clusters and creates new ones', async () => {
    const clusterPhotos = [
      {
        id: 'p1',
        takenAt: new Date('2025-07-15T09:00:00Z'),
        lat: null,
        lng: null,
      },
      {
        id: 'p2',
        takenAt: new Date('2025-07-16T09:00:00Z'),
        lat: null,
        lng: null,
      },
    ];

    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    prisma.cluster.findMany.mockResolvedValue([{ id: 'old-cluster-1' }]);
    prisma.clusterPhoto.deleteMany.mockResolvedValue({ count: 1 });
    prisma.cluster.deleteMany.mockResolvedValue({ count: 1 });
    prisma.cluster.create
      .mockResolvedValueOnce({ id: 'new-c1', title: 'Day 1' })
      .mockResolvedValueOnce({ id: 'new-c2', title: 'Day 2' });
    prisma.clusterPhoto.createMany.mockResolvedValue({ count: 1 });

    const result = await service.rebuildForRoom('room-1', clusterPhotos);

    expect(prisma.cluster.deleteMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', clusterType: ClusterType.TIME_GPS },
    });
    expect(prisma.cluster.create).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it('rebuildForRoom returns empty array when no photos', async () => {
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    prisma.cluster.findMany.mockResolvedValue([]);
    prisma.clusterPhoto.deleteMany.mockResolvedValue({ count: 0 });
    prisma.cluster.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.rebuildForRoom('room-1', []);
    expect(result).toEqual([]);
  });

  it('findByRoom returns clusters with thumbnailUrl null when thumbnailKey is null', async () => {
    prisma.cluster.findMany.mockResolvedValue([
      { id: 'c1', thumbnailKey: null },
    ]);
    const result = await service.findByRoom('room-1');
    expect(result[0]).toMatchObject({ id: 'c1', thumbnailUrl: null });
  });

  it('findByRoom returns clusters with thumbnailUrl when thumbnailKey exists', async () => {
    prisma.cluster.findMany.mockResolvedValue([
      { id: 'c1', thumbnailKey: 'rooms/r1/clusters/c1.jpg' },
    ]);
    const result = await service.findByRoom('room-1');
    expect(result[0].thumbnailUrl).toBe('https://signed.test/photo');
  });

  it('updateTitle updates cluster title and emits cluster:updated', async () => {
    prisma.cluster.updateMany.mockResolvedValue({ count: 1 });
    prisma.cluster.findUniqueOrThrow.mockResolvedValue({
      id: 'c1',
      title: 'New Title',
      roomId: 'room-1',
    });

    await service.updateTitle('room-1', 'c1', 'New Title');

    expect(prisma.cluster.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', roomId: 'room-1' },
      data: { title: 'New Title' },
    });
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      'cluster:updated',
      expect.objectContaining({ clusterId: 'c1', title: 'New Title' }),
    );
  });

  it('updateTitle rejects clusters outside the room', async () => {
    prisma.cluster.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateTitle('room-1', 'c-other', 'New Title'),
    ).rejects.toThrow('Cluster not found in room');

    expect(prisma.cluster.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it('findPhotosInCluster returns photos with url and thumbnailUrl', async () => {
    prisma.cluster.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.clusterPhoto.findMany.mockResolvedValue([
      {
        photo: {
          id: 'p1',
          s3Key: 'rooms/r1/photos/p1.jpg',
          thumbnailKey: 'rooms/r1/thumbs/p1.jpg',
        },
      },
    ]);

    const result = await service.findPhotosInCluster('room-1', 'c1');
    expect(result[0]).toMatchObject({
      id: 'p1',
      url: 'https://signed.test/photo',
    });
  });

  it('findPhotosInCluster sets thumbnailUrl null when thumbnailKey is null', async () => {
    prisma.cluster.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.clusterPhoto.findMany.mockResolvedValue([
      {
        photo: {
          id: 'p1',
          s3Key: 'rooms/r1/photos/p1.jpg',
          thumbnailKey: null,
        },
      },
    ]);
    const result = await service.findPhotosInCluster('room-1', 'c1');
    expect(result[0].thumbnailUrl).toBeNull();
  });

  it('findPhotosInCluster rejects clusters outside the room', async () => {
    prisma.cluster.findFirst.mockResolvedValue(null);

    await expect(
      service.findPhotosInCluster('room-1', 'c-other'),
    ).rejects.toThrow('Cluster not found in room');

    expect(prisma.clusterPhoto.findMany).not.toHaveBeenCalled();
  });
});
