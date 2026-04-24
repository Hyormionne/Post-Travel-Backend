import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('POST /auth/signup → 201 + access token + refresh cookie', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({ email, password: 'password1234', nickname: 'e2e' })
      .expect(201);
    expect((res.body as { accessToken: string }).accessToken).toBeDefined();
    expect(
      (res.headers['set-cookie'] as unknown as string[])?.join(''),
    ).toMatch(/refresh_token=/);
  });

  it('POST /auth/signup → 409 on duplicate email', async () => {
    await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({ email, password: 'password1234', nickname: 'dup' })
      .expect(409);
  });

  it('POST /auth/login → 200 + tokens', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email, password: 'password1234' })
      .expect(200);
    expect((res.body as { accessToken: string }).accessToken).toBeDefined();
  });

  it('POST /auth/login → 401 on wrong password', async () => {
    await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('GET /health → 200', async () => {
    await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200);
  });
});
