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
import { JobStatus, JobType } from 'generated/prisma/client';

const INTERNAL_TOKEN = process.env.GPU_INTERNAL_TOKEN ?? 'dev-internal-token';

const mockS3 = {
  createPresignedPutUrl: jest
    .fn()
    .mockResolvedValue('https://mock-s3.example.com/upload'),
  getPresignedGetUrl: jest
    .fn()
    .mockResolvedValue('https://mock-s3.example.com/signed'),
};

type LoginBody = { accessToken: string };
type JwtPayload = { sub: string };
type RoomBody = { id: string };
type PresignedItem = {
  photoId: string;
  original: { url: string };
  thumbnail: { url: string };
};

describe('GPU Jobs Webhook E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let roomId: string;
  let photoId: string;
  let processingJobId: string;
  let foreignRoomId: string | undefined;

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

    // Create user + login
    await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({
        email: 'webhooktest@example.com',
        password: 'Password123!',
        nickname: 'WebhookUser',
      });

    const loginRes = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'webhooktest@example.com', password: 'Password123!' });
    accessToken = (loginRes.body as LoginBody).accessToken;
    const decoded = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString(),
    ) as JwtPayload;
    userId = decoded.sub;

    // Create room
    const roomRes = await request(app.getHttpServer() as Server)
      .post('/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Webhook Test Room',
        inviteUrl:
          'https://app.example.com/join/880e8400-e29b-41d4-a716-446655440001',
      });
    roomId = (roomRes.body as RoomBody).id;

    // Create photo via presigned URL flow
    const presignedRes = await request(app.getHttpServer() as Server)
      .post('/photos/presigned-urls')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roomId,
        files: [{ name: 'p.jpg', size: 1024, contentType: 'image/jpeg' }],
      });
    photoId = (presignedRes.body as PresignedItem[])[0].photoId;

    await request(app.getHttpServer() as Server)
      .post('/photos/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roomId,
        photos: [
          {
            photoId,
            s3Key: `rooms/${roomId}/photos/${photoId}.jpg`,
            thumbnailKey: `rooms/${roomId}/thumbs/${photoId}.jpg`,
            fileSize: 1024,
          },
        ],
      });

    // Directly insert a ProcessingJob to test the webhook
    const job = await prisma.processingJob.create({
      data: {
        roomId,
        jobType: JobType.VLM_ANALYZE,
        status: JobStatus.RUNNING,
        totalCount: 1,
        doneCount: 0,
      },
    });
    processingJobId = job.id;
  });

  afterAll(async () => {
    await prisma.travelRoom
      .deleteMany({ where: { id: { in: [roomId, foreignRoomId ?? roomId] } } })
      .catch(() => null);
    await prisma.user.deleteMany({
      where: { email: 'webhooktest@example.com' },
    });
    await app.close();
  });

  it('POST /internal/jobs/:jobId/callback — returns 401 without X-Internal-Token', async () => {
    await request(app.getHttpServer() as Server)
      .post(`/internal/jobs/${processingJobId}/callback`)
      .send({ results: [] })
      .expect(401);
  });

  it('POST /internal/jobs/:jobId/callback — updates photo AI fields and marks job SUCCESS', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/internal/jobs/${processingJobId}/callback`)
      .set('X-Internal-Token', INTERNAL_TOKEN)
      .send({
        results: [
          {
            photoId,
            sceneLabel: 'beach',
            aiCaption: '해변의 석양',
            aiKeywords: ['beach', 'sunset'],
          },
        ],
      })
      .expect(201);

    expect(res.body).toEqual({});

    const photo = await prisma.photo.findUnique({ where: { id: photoId } });
    expect(photo?.sceneLabel).toBe('beach');
    expect(photo?.aiCaption).toBe('해변의 석양');
    expect(photo?.aiKeywords).toEqual(['beach', 'sunset']);

    const job = await prisma.processingJob.findUnique({
      where: { id: processingJobId },
    });
    expect(job?.status).toBe(JobStatus.SUCCESS);
    expect(job?.doneCount).toBe(1);
  });

  it('POST /internal/jobs/:jobId/callback — second call is a no-op (idempotent)', async () => {
    await request(app.getHttpServer() as Server)
      .post(`/internal/jobs/${processingJobId}/callback`)
      .set('X-Internal-Token', INTERNAL_TOKEN)
      .send({
        results: [
          { photoId, sceneLabel: 'mountain', aiCaption: 'x', aiKeywords: [] },
        ],
      })
      .expect(201);

    // Photo should still have the original values from first callback
    const photo = await prisma.photo.findUnique({ where: { id: photoId } });
    expect(photo?.sceneLabel).toBe('beach');
  });

  it('POST /internal/jobs/:jobId/callback — creates VLM_SCENE cluster when provided', async () => {
    // Create a fresh RUNNING job for this test
    const freshJob = await prisma.processingJob.create({
      data: {
        roomId,
        jobType: JobType.VLM_ANALYZE,
        status: JobStatus.RUNNING,
        totalCount: 0,
      },
    });

    await request(app.getHttpServer() as Server)
      .post(`/internal/jobs/${freshJob.id}/callback`)
      .set('X-Internal-Token', INTERNAL_TOKEN)
      .send({
        results: [],
        cluster: {
          title: 'Beach Day',
          summary: '바다를 따라 걷던 오후',
          sceneLabel: 'beach',
          photoIds: [photoId],
        },
      })
      .expect(201);

    const clusters = await prisma.cluster.findMany({
      where: { roomId, clusterType: 'VLM_SCENE' },
    });
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0].title).toBe('Beach Day');

    await prisma.processingJob
      .delete({ where: { id: freshJob.id } })
      .catch(() => null);
  });

  it('POST /internal/jobs/:jobId/callback — rejects cluster photoIds from another room', async () => {
    const foreignRoom = await prisma.travelRoom.create({
      data: {
        title: 'Foreign Webhook Room',
        inviteToken: crypto.randomUUID(),
        createdBy: userId,
      },
    });
    foreignRoomId = foreignRoom.id;
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
    const freshJob = await prisma.processingJob.create({
      data: {
        roomId,
        jobType: JobType.VLM_ANALYZE,
        status: JobStatus.RUNNING,
        totalCount: 0,
      },
    });

    await request(app.getHttpServer() as Server)
      .post(`/internal/jobs/${freshJob.id}/callback`)
      .set('X-Internal-Token', INTERNAL_TOKEN)
      .send({
        results: [],
        cluster: {
          title: 'Bad Cluster',
          summary: 'Cross-room photo should be rejected',
          sceneLabel: 'beach',
          photoIds: [foreignPhoto.id],
        },
      })
      .expect(400);

    const linked = await prisma.clusterPhoto.findMany({
      where: { photoId: foreignPhoto.id },
    });
    expect(linked).toHaveLength(0);
  });
});
