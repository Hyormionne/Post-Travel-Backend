/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Server } from 'node:http';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { GpuJobsService } from 'src/modules/gpu-jobs/gpu-jobs.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';

type LoginBody = { accessToken: string };
type JwtPayload = { sub: string };
type RoomBody = { id: string };
type PresignedItem = {
  photoId: string;
  original: { url: string };
  thumbnail: { url: string };
};
type PhotoBody = { id: string; uploadedBy: string };
type ClusterBody = { id: string; title: string; dayNumber: number };

const mockS3 = {
  createPresignedPutUrl: jest
    .fn()
    .mockResolvedValue(
      'https://mock-s3.example.com/upload?X-Amz-Signature=mock',
    ),
  getPresignedGetUrl: jest
    .fn()
    .mockResolvedValue('https://mock-s3.example.com/signed'),
};

describe('Photos + Clusters E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let roomId: string;
  const extraRoomIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(S3Service)
      .useValue(mockS3)
      .overrideProvider(GpuJobsService)
      .useValue({
        enqueueVlmJob: jest.fn().mockResolvedValue({ id: 'mock-job' }),
      })
      .overrideProvider(RealtimeService)
      .useValue({ emitToRoom: jest.fn(), setServer: jest.fn() })
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({
        email: 'phototest@example.com',
        password: 'Password123!',
        nickname: 'PhotoTester',
      });

    const loginRes = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'phototest@example.com', password: 'Password123!' });

    accessToken = (loginRes.body as LoginBody).accessToken;
    const decoded = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString(),
    ) as JwtPayload;
    userId = decoded.sub;

    const roomRes = await request(app.getHttpServer() as Server)
      .post('/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Photo Test Room',
        inviteUrl:
          'https://app.example.com/join/770e8400-e29b-41d4-a716-446655440001',
      });

    roomId = (roomRes.body as RoomBody).id;
  });

  afterAll(async () => {
    await prisma.travelRoom
      .deleteMany({ where: { id: { in: [roomId, ...extraRoomIds] } } })
      .catch(() => null);
    await prisma.user.deleteMany({ where: { email: 'phototest@example.com' } });
    await app.close();
  });

  it('POST /photos/presigned-urls — Presigned URL 2개 반환', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/photos/presigned-urls')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roomId,
        files: [
          { name: 'photo1.jpg', size: 2048, contentType: 'image/jpeg' },
          { name: 'photo2.jpg', size: 3072, contentType: 'image/jpeg' },
        ],
      })
      .expect(201);

    const body = res.body as PresignedItem[];
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      photoId: expect.any(String),
      original: {
        url: 'https://mock-s3.example.com/upload?X-Amz-Signature=mock',
        key: expect.any(String),
      },
      thumbnail: {
        url: 'https://mock-s3.example.com/upload?X-Amz-Signature=mock',
        key: expect.any(String),
      },
    });
    expect(mockS3.createPresignedPutUrl).toHaveBeenCalledTimes(4);
  });

  it('POST /photos/complete — Photo 저장 + 클러스터 생성', async () => {
    const photoId1 = crypto.randomUUID();
    const photoId2 = crypto.randomUUID();

    const res = await request(app.getHttpServer() as Server)
      .post('/photos/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roomId,
        photos: [
          {
            photoId: photoId1,
            s3Key: `rooms/${roomId}/photos/${photoId1}.jpg`,
            thumbnailKey: `rooms/${roomId}/thumbs/${photoId1}.jpg`,
            fileSize: 2048,
            width: 4032,
            height: 3024,
            takenAt: '2025-07-15T09:00:00.000Z',
            lat: 33.4996,
            lng: 126.5312,
          },
          {
            photoId: photoId2,
            s3Key: `rooms/${roomId}/photos/${photoId2}.jpg`,
            thumbnailKey: `rooms/${roomId}/thumbs/${photoId2}.jpg`,
            fileSize: 3072,
            takenAt: '2025-07-16T10:00:00.000Z',
          },
        ],
      })
      .expect(201);

    const photos = res.body as PhotoBody[];
    expect(photos).toHaveLength(2);
    expect(photos[0].uploadedBy).toBe(userId);

    const clusterRes = await request(app.getHttpServer() as Server)
      .get('/clusters')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ roomId })
      .expect(200);

    const clusters = clusterRes.body as ClusterBody[];
    expect(clusters).toHaveLength(2);
    expect(clusters[0].title).toBe('Day 1');
    expect(clusters[0].dayNumber).toBe(1);
    expect(clusters[1].title).toBe('Day 2');
  });

  it('POST /photos/complete — 다른 방 photoId를 섞으면 거부', async () => {
    const foreignRoom = await prisma.travelRoom.create({
      data: {
        title: 'Foreign Photo Room',
        inviteToken: crypto.randomUUID(),
        createdBy: userId,
      },
    });
    extraRoomIds.push(foreignRoom.id);
    const foreignPhoto = await prisma.photo.create({
      data: {
        id: crypto.randomUUID(),
        roomId: foreignRoom.id,
        uploadedBy: userId,
        s3Key: `rooms/${foreignRoom.id}/photos/foreign.jpg`,
        fileSize: 1024,
        aiKeywords: [],
      },
    });

    await request(app.getHttpServer() as Server)
      .post('/photos/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roomId,
        photos: [
          {
            photoId: foreignPhoto.id,
            s3Key: `rooms/${roomId}/photos/${foreignPhoto.id}.jpg`,
            fileSize: 1024,
          },
        ],
      })
      .expect(400);
  });

  it('GET /photos?roomId — 사진 목록 조회', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/photos')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ roomId })
      .expect(200);

    expect((res.body as PhotoBody[]).length).toBeGreaterThanOrEqual(2);
  });

  it('GET /clusters/:clusterId/photos — 클러스터 내 사진', async () => {
    const clusterRes = await request(app.getHttpServer() as Server)
      .get('/clusters')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ roomId })
      .expect(200);

    const clusterId = (clusterRes.body as ClusterBody[])[0].id;

    const res = await request(app.getHttpServer() as Server)
      .get(`/clusters/${clusterId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ roomId })
      .expect(200);

    expect((res.body as PhotoBody[]).length).toBeGreaterThanOrEqual(1);
  });

  it('PATCH /clusters/:clusterId — 제목 수정', async () => {
    const clusterRes = await request(app.getHttpServer() as Server)
      .get('/clusters')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ roomId })
      .expect(200);

    const clusterId = (clusterRes.body as ClusterBody[])[0].id;

    const res = await request(app.getHttpServer() as Server)
      .patch(`/clusters/${clusterId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ roomId, title: '첫째 날 - 한라산' })
      .expect(200);

    expect((res.body as ClusterBody).title).toBe('첫째 날 - 한라산');
  });

  it('PATCH /clusters/:clusterId — 다른 방 clusterId면 거부', async () => {
    const foreignRoom = await prisma.travelRoom.create({
      data: {
        title: 'Foreign Cluster Room',
        inviteToken: crypto.randomUUID(),
        createdBy: userId,
      },
    });
    extraRoomIds.push(foreignRoom.id);
    const foreignCluster = await prisma.cluster.create({
      data: {
        roomId: foreignRoom.id,
        title: 'Foreign Cluster',
      },
    });

    await request(app.getHttpServer() as Server)
      .patch(`/clusters/${foreignCluster.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ roomId, title: '침범 시도' })
      .expect(404);
  });

  it('GET /clusters/:clusterId/photos — 다른 방 clusterId면 거부', async () => {
    const foreignRoom = await prisma.travelRoom.create({
      data: {
        title: 'Foreign Cluster Photos Room',
        inviteToken: crypto.randomUUID(),
        createdBy: userId,
      },
    });
    extraRoomIds.push(foreignRoom.id);
    const foreignPhoto = await prisma.photo.create({
      data: {
        id: crypto.randomUUID(),
        roomId: foreignRoom.id,
        uploadedBy: userId,
        s3Key: `rooms/${foreignRoom.id}/photos/foreign.jpg`,
        fileSize: 1024,
        aiKeywords: [],
      },
    });
    const foreignCluster = await prisma.cluster.create({
      data: {
        roomId: foreignRoom.id,
        title: 'Foreign Cluster Photos',
        clusterPhotos: {
          create: { photoId: foreignPhoto.id },
        },
      },
    });

    await request(app.getHttpServer() as Server)
      .get(`/clusters/${foreignCluster.id}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ roomId })
      .expect(404);
  });

  it('DELETE /photos/:photoId — 사진 삭제', async () => {
    const photoRes = await request(app.getHttpServer() as Server)
      .get('/photos')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ roomId })
      .expect(200);

    const photoId = (photoRes.body as PhotoBody[])[0].id;

    await request(app.getHttpServer() as Server)
      .delete(`/photos/${photoId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ roomId })
      .expect(204);

    const after = await prisma.photo.findUnique({ where: { id: photoId } });
    expect(after).toBeNull();
  });
});
