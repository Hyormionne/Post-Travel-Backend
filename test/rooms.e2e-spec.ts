import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';

describe('Rooms E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let roomId: string;
  let inviteToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    // Signup + login to get JWT
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'roomtest@example.com', password: 'Password123!', nickname: 'RoomTester' });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'roomtest@example.com', password: 'Password123!' });

    accessToken = loginRes.body.accessToken;
    const decoded = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString(),
    );
    userId = decoded.sub;
  });

  afterAll(async () => {
    await prisma.roomMember.deleteMany({ where: { userId } });
    await prisma.travelRoom.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email: 'roomtest@example.com' } });
    await app.close();
  });

  it('POST /rooms — 방 생성 성공', async () => {
    const res = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: '제주도 여행 E2E' })
      .expect(201);

    expect(res.body.title).toBe('제주도 여행 E2E');
    expect(res.body.createdBy).toBe(userId);
    expect(typeof res.body.inviteToken).toBe('string');
    roomId = res.body.id;
    inviteToken = res.body.inviteToken;
  });

  it('GET /rooms/:roomId — 방 조회 성공 (멤버)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(roomId);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].role).toBe('OWNER');
  });

  it('GET /rooms/:roomId — 403 (비멤버)', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'nonmember@example.com', password: 'Password123!', nickname: 'NonMember' });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nonmember@example.com', password: 'Password123!' });

    const otherToken = loginRes.body.accessToken;

    await request(app.getHttpServer())
      .get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    // Cleanup
    await prisma.user.deleteMany({ where: { email: 'nonmember@example.com' } });
  });

  it('GET /rooms/join/:token — 토큰으로 방 참가', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'joiner@example.com', password: 'Password123!', nickname: 'Joiner' });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'joiner@example.com', password: 'Password123!' });

    const joinerToken = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get(`/rooms/join/${inviteToken}`)
      .set('Authorization', `Bearer ${joinerToken}`)
      .expect(200);

    expect(res.body.role).toBe('MEMBER');

    // Cleanup
    const joinerDecoded = JSON.parse(
      Buffer.from(joinerToken.split('.')[1], 'base64').toString(),
    );
    await prisma.roomMember.deleteMany({ where: { userId: joinerDecoded.sub } });
    await prisma.user.deleteMany({ where: { email: 'joiner@example.com' } });
  });

  it('POST /rooms/:roomId/invite-token — 토큰 재발급 (OWNER)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/rooms/${roomId}/invite-token`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(typeof res.body.inviteToken).toBe('string');
    expect(res.body.inviteToken).not.toBe(inviteToken);
  });

  it('DELETE /rooms/:roomId — 방 삭제 성공 (OWNER)', async () => {
    await request(app.getHttpServer())
      .delete(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const deleted = await prisma.travelRoom.findUnique({ where: { id: roomId } });
    expect(deleted).toBeNull();
  });
});
