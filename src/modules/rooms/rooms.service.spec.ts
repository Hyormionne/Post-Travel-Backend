/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RoomRole } from 'generated/prisma/client';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
  let prisma: {
    travelRoom: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
    };
    roomMember: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let realtime: jest.Mocked<Partial<RealtimeService>>;
  let service: RoomsService;

  beforeEach(() => {
    prisma = {
      travelRoom: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
      },
      roomMember: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    realtime = { emitToRoom: jest.fn() };
    service = new RoomsService(
      prisma as unknown as PrismaService,
      realtime as RealtimeService,
    );
  });

  it('create makes a room with OWNER membership', async () => {
    const roomId = 'room-1';
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    prisma.travelRoom.create.mockResolvedValue({ id: roomId, title: 'Trip' });
    prisma.roomMember.create.mockResolvedValue({});

    const result = await service.create('user-1', 'Trip');

    expect(prisma.travelRoom.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Trip', createdBy: 'user-1' }),
      }),
    );
    expect(result).toMatchObject({ id: roomId });
  });

  it('findById returns null when not found', async () => {
    prisma.travelRoom.findUnique.mockResolvedValue(null);
    await expect(service.findById('nonexistent')).resolves.toBeNull();
  });

  it('joinByToken throws NotFoundException if token is invalid', async () => {
    prisma.travelRoom.findFirst.mockResolvedValue(null);
    await expect(service.joinByToken('bad-token', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('joinByToken throws ConflictException if already a member', async () => {
    prisma.travelRoom.findFirst.mockResolvedValue({ id: 'room-1' });
    prisma.roomMember.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.joinByToken('valid-token', 'user-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('joinByToken emits room:member_joined after creating membership', async () => {
    prisma.travelRoom.findFirst.mockResolvedValue({ id: 'room-1' });
    prisma.roomMember.findUnique.mockResolvedValue(null);
    prisma.roomMember.create.mockResolvedValue({ id: 'm1', roomId: 'room-1' });

    await service.joinByToken('valid-token', 'user-1');

    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      'room:member_joined',
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('isMember returns true when membership exists', async () => {
    prisma.roomMember.findUnique.mockResolvedValue({
      id: 'm1',
      role: RoomRole.MEMBER,
    });
    await expect(service.isMember('room-1', 'user-1')).resolves.toBe(true);
  });

  it('isMember returns false when no membership', async () => {
    prisma.roomMember.findUnique.mockResolvedValue(null);
    await expect(service.isMember('room-1', 'user-1')).resolves.toBe(false);
  });

  it('getRole returns OWNER when user is owner', async () => {
    prisma.roomMember.findUnique.mockResolvedValue({ role: RoomRole.OWNER });
    await expect(service.getRole('room-1', 'user-1')).resolves.toBe(
      RoomRole.OWNER,
    );
  });

  it('getRole returns null when not a member', async () => {
    prisma.roomMember.findUnique.mockResolvedValue(null);
    await expect(service.getRole('room-1', 'user-1')).resolves.toBeNull();
  });

  it('create makes a room without title when title is undefined', async () => {
    const roomId = 'room-2';
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    prisma.travelRoom.create.mockResolvedValue({ id: roomId, title: null });
    prisma.roomMember.create.mockResolvedValue({});

    const result = await service.create('user-1', undefined);

    expect(prisma.travelRoom.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: undefined,
          createdBy: 'user-1',
        }),
      }),
    );
    expect(result).toMatchObject({ id: roomId });
  });

  it('updateTitle updates the room title', async () => {
    prisma.travelRoom.update.mockResolvedValue({
      id: 'room-1',
      title: '새 제목',
    });

    const result = await service.updateTitle('room-1', '새 제목');

    expect(prisma.travelRoom.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { title: '새 제목' },
    });
    expect(result).toMatchObject({ title: '새 제목' });
  });
});
