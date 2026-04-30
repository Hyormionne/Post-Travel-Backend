/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from 'src/prisma/prisma.service';
import { ClustersService } from 'src/modules/clusters/clusters.service';
import { S3Service } from 'src/s3/s3.service';
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
      createPresignedPhotoPost: jest
        .fn()
        .mockResolvedValue({ url: 'https://s3.test', fields: {} }),
      getMaxPhotoBytes: jest.fn().mockReturnValue(20971520),
      getMaxThumbBytes: jest.fn().mockReturnValue(512000),
      getPresignedGetUrl: jest
        .fn()
        .mockResolvedValue('https://signed.test/photo'),
    };
    clusters = { rebuildForRoom: jest.fn().mockResolvedValue([]) };
    service = new PhotosService(
      prisma as unknown as PrismaService,
      s3 as S3Service,
      clusters as ClustersService,
    );
  });

  it('generatePresignedUrls returns one item per file', async () => {
    const result = await service.generatePresignedUrls('room-1', [
      { name: 'photo.jpg', size: 1024, contentType: 'image/jpeg' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      photoId: expect.any(String),
      original: { url: 'https://s3.test', fields: {} },
      thumbnail: { url: 'https://s3.test', fields: {} },
    });
    expect(s3.createPresignedPhotoPost).toHaveBeenCalledTimes(2);
  });

  it('complete creates photo records and triggers clustering', async () => {
    prisma.photo.createMany.mockResolvedValue({ count: 1 });
    prisma.photo.findMany
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

    expect(prisma.photo.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'p1', roomId: 'room-1' }),
        ]),
      }),
    );
    expect(clusters.rebuildForRoom).toHaveBeenCalledWith(
      'room-1',
      expect.any(Array),
    );
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
    expect(s3.getPresignedGetUrl).toHaveBeenCalledTimes(2);
  });

  it('findByRoom sets thumbnailUrl to null when thumbnailKey is null', async () => {
    prisma.photo.findMany.mockResolvedValue([
      { id: 'p1', s3Key: 'rooms/r1/photos/p1.jpg', thumbnailKey: null },
    ]);

    const result = await service.findByRoom('room-1');

    expect(result[0].thumbnailUrl).toBeNull();
    expect(s3.getPresignedGetUrl).toHaveBeenCalledTimes(1);
  });
});
