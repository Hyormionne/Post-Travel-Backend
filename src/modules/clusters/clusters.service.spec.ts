import { PrismaService } from 'src/prisma/prisma.service';
import { ClusterType } from 'generated/prisma/client';
import { ClustersService } from './clusters.service';

describe('ClustersService', () => {
  let prisma: {
    cluster: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    clusterPhoto: {
      createMany: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: ClustersService;

  beforeEach(() => {
    prisma = {
      cluster: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      clusterPhoto: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    service = new ClustersService(prisma as unknown as PrismaService);
  });

  it('rebuildForRoom deletes old TIME_GPS clusters and creates new ones', async () => {
    const clusterPhotos = [
      { id: 'p1', takenAt: new Date('2025-07-15T09:00:00Z'), lat: null, lng: null },
      { id: 'p2', takenAt: new Date('2025-07-16T09:00:00Z'), lat: null, lng: null },
    ];

    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
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
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    prisma.cluster.findMany.mockResolvedValue([]);
    prisma.clusterPhoto.deleteMany.mockResolvedValue({ count: 0 });
    prisma.cluster.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.rebuildForRoom('room-1', []);
    expect(result).toEqual([]);
    expect(prisma.cluster.create).not.toHaveBeenCalled();
  });

  it('findByRoom returns clusters for the room', async () => {
    prisma.cluster.findMany.mockResolvedValue([{ id: 'c1' }]);
    const result = await service.findByRoom('room-1');
    expect(prisma.cluster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: 'room-1' } }),
    );
    expect(result).toHaveLength(1);
  });

  it('updateTitle updates cluster title', async () => {
    prisma.cluster.update.mockResolvedValue({ id: 'c1', title: 'New Title' });
    await service.updateTitle('c1', 'New Title');
    expect(prisma.cluster.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { title: 'New Title' },
    });
  });
});
