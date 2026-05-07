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
type RoomBody = { id: string };
type BlogBody = {
  id: string;
  title: string;
  visibility: string;
  publishedAt: string | null;
};

const mockS3 = {
  createPresignedPutUrl: jest
    .fn()
    .mockResolvedValue('https://mock-s3.example.com/upload?sig=mock'),
  getPresignedGetUrl: jest
    .fn()
    .mockResolvedValue('https://mock-s3.example.com/signed'),
};

describe('Blogs E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let roomId: string;
  let otherToken: string;
  let blogId: string;

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
        email: 'blogtest@example.com',
        password: 'Password123!',
        nickname: 'BlogTester',
      });

    const loginRes = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'blogtest@example.com', password: 'Password123!' });
    accessToken = (loginRes.body as LoginBody).accessToken;

    await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({
        email: 'blogother@example.com',
        password: 'Password123!',
        nickname: 'OtherUser',
      });

    const otherLogin = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'blogother@example.com', password: 'Password123!' });
    otherToken = (otherLogin.body as LoginBody).accessToken;

    const roomRes = await request(app.getHttpServer() as Server)
      .post('/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Blog Test Room' });
    roomId = (roomRes.body as RoomBody).id;
  });

  afterAll(async () => {
    await prisma.travelRoom.deleteMany({ where: { title: 'Blog Test Room' } });
    await prisma.user.deleteMany({
      where: {
        email: { in: ['blogtest@example.com', 'blogother@example.com'] },
      },
    });
    await app.close();
  });

  it('POST /blogs creates a blog (201)', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/blogs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ roomId, title: 'My First Blog', content: 'Hello world' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'My First Blog',
      visibility: 'ROOM',
      publishedAt: null,
    });
    blogId = (res.body as BlogBody).id;
  });

  it('GET /blogs?roomId returns list (200)', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/blogs?roomId=${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as BlogBody[]).length).toBeGreaterThanOrEqual(1);
  });

  it('GET /blogs/:id returns single blog (200)', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/blogs/${blogId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect((res.body as BlogBody).id).toBe(blogId);
  });

  it('GET /blogs/:id returns 403 for non-member', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/blogs/${blogId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  it('PATCH /blogs/:id updates the blog (200)', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/blogs/${blogId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect((res.body as BlogBody).title).toBe('Updated Title');
  });

  it('PATCH /blogs/:id returns 403 for non-author', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/blogs/${blogId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('POST /blogs/:id/publish publishes the blog (201)', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/blogs/${blogId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(201);
    expect((res.body as BlogBody).publishedAt).not.toBeNull();
  });

  it('DELETE /blogs/:id deletes the blog (204)', async () => {
    const createRes = await request(app.getHttpServer() as Server)
      .post('/blogs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ roomId, title: 'To Delete', content: 'bye' });
    const toDeleteId = (createRes.body as BlogBody).id;

    const res = await request(app.getHttpServer() as Server)
      .delete(`/blogs/${toDeleteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);
  });
});
