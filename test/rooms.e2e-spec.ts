import type { Server } from 'node:http';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';

type LoginBody = { accessToken: string };
type JwtPayload = { sub: string };
type RoomBody = {
  id: string;
  title: string | null;
  createdBy: string;
  inviteToken: string;
  members: Array<{ role: string }>;
};
type MemberBody = { role: string };
type InviteTokenBody = { inviteToken: string };

describe('Rooms E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let roomId: string;
  let inviteToken: string;
  let untitledRoomId: string;

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

    await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({
        email: 'roomtest@example.com',
        password: 'Password123!',
        nickname: 'RoomTester',
      });

    const loginRes = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'roomtest@example.com', password: 'Password123!' });

    accessToken = (loginRes.body as LoginBody).accessToken;
    const decoded = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString(),
    ) as JwtPayload;
    userId = decoded.sub;
  });

  afterAll(async () => {
    await prisma.roomMember.deleteMany({ where: { userId } });
    await prisma.travelRoom.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email: 'roomtest@example.com' } });
    await app.close();
  });

  it('POST /rooms — 방 생성 성공', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: '제주도 여행 E2E' })
      .expect(201);

    const body = res.body as RoomBody;
    expect(body.title).toBe('제주도 여행 E2E');
    expect(body.createdBy).toBe(userId);
    expect(typeof body.inviteToken).toBe('string');
    roomId = body.id;
    inviteToken = body.inviteToken;
  });

  it('GET /rooms/:roomId — 방 조회 성공 (멤버)', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body as RoomBody;
    expect(body.id).toBe(roomId);
    expect(body.members).toHaveLength(1);
    expect(body.members[0].role).toBe('OWNER');
  });

  it('GET /rooms — 로그인 유저가 멤버인 방 목록 조회', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body as RoomBody[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((room) => room.id)).toContain(roomId);
  });

  it('GET /rooms/:roomId — 403 (비멤버)', async () => {
    await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({
        email: 'nonmember@example.com',
        password: 'Password123!',
        nickname: 'NonMember',
      });

    const loginRes = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'nonmember@example.com', password: 'Password123!' });

    const otherToken = (loginRes.body as LoginBody).accessToken;

    await request(app.getHttpServer() as Server)
      .get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    await prisma.user.deleteMany({ where: { email: 'nonmember@example.com' } });
  });

  it('GET /rooms/join/:token — 토큰으로 방 참가', async () => {
    await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({
        email: 'joiner@example.com',
        password: 'Password123!',
        nickname: 'Joiner',
      });

    const loginRes = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'joiner@example.com', password: 'Password123!' });

    const joinerToken = (loginRes.body as LoginBody).accessToken;

    const res = await request(app.getHttpServer() as Server)
      .get(`/rooms/join/${inviteToken}`)
      .set('Authorization', `Bearer ${joinerToken}`)
      .expect(200);

    expect((res.body as MemberBody).role).toBe('MEMBER');

    const joinerDecoded = JSON.parse(
      Buffer.from(joinerToken.split('.')[1], 'base64').toString(),
    ) as JwtPayload;
    await prisma.roomMember.deleteMany({
      where: { userId: joinerDecoded.sub },
    });
    await prisma.user.deleteMany({ where: { email: 'joiner@example.com' } });
  });

  it('POST /rooms/:roomId/invite-token — 토큰 재발급 (OWNER)', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/rooms/${roomId}/invite-token`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const body = res.body as InviteTokenBody;
    expect(typeof body.inviteToken).toBe('string');
    expect(body.inviteToken).not.toBe(inviteToken);
  });

  it('POST /rooms — 제목 없이 방 생성 성공', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    const body = res.body as RoomBody;
    expect(body.title).toBeNull();
    expect(body.createdBy).toBe(userId);
    untitledRoomId = body.id;
  });

  it('PATCH /rooms/:roomId — 방 제목 설정 성공 (OWNER)', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/rooms/${untitledRoomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: '나중에 정한 제목' })
      .expect(200);

    const body = res.body as RoomBody;
    expect(body.title).toBe('나중에 정한 제목');
  });

  it('PATCH /rooms/:roomId — 403 (비 OWNER)', async () => {
    await request(app.getHttpServer() as Server)
      .post('/auth/signup')
      .send({
        email: 'patcher@example.com',
        password: 'Password123!',
        nickname: 'Patcher',
      });

    const loginRes = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'patcher@example.com', password: 'Password123!' });

    const patcherToken = (loginRes.body as LoginBody).accessToken;

    await request(app.getHttpServer() as Server)
      .patch(`/rooms/${untitledRoomId}`)
      .set('Authorization', `Bearer ${patcherToken}`)
      .send({ title: '탈취 시도' })
      .expect(403);

    await prisma.user.deleteMany({ where: { email: 'patcher@example.com' } });
  });

  it('DELETE /rooms/:roomId — 방 삭제 성공 (OWNER)', async () => {
    await request(app.getHttpServer() as Server)
      .delete(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const deleted = await prisma.travelRoom.findUnique({
      where: { id: roomId },
    });
    expect(deleted).toBeNull();
  });
});
