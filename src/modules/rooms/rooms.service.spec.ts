import { NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RoomRole } from 'generated/prisma/client';
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
    service = new RoomsService(prisma as unknown as PrismaService);
  });

  it('create makes a room with OWNER membership', async () => {
    const roomId = 'room-1';
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    prisma.travelRoom.create.mockResolvedValue({ id: roomId, title: 'Trip' });
    prisma.roomMember.create.mockResolvedValue({});

    const result = await service.create('user-1', 'Trip');

    expect(prisma.travelRoom.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Trip', createdBy: 'user-1' }),
      }),
    );
    expect(prisma.roomMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roomId, userId: 'user-1', role: RoomRole.OWNER }),
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
    await expect(service.joinByToken('bad-token', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('joinByToken throws ConflictException if already a member', async () => {
    prisma.travelRoom.findFirst.mockResolvedValue({ id: 'room-1' });
    prisma.roomMember.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.joinByToken('valid-token', 'user-1')).rejects.toThrow(ConflictException);
  });

  it('isMember returns true when membership exists', async () => {
    prisma.roomMember.findUnique.mockResolvedValue({ id: 'm1', role: RoomRole.MEMBER });
    await expect(service.isMember('room-1', 'user-1')).resolves.toBe(true);
  });

  it('isMember returns false when no membership', async () => {
    prisma.roomMember.findUnique.mockResolvedValue(null);
    await expect(service.isMember('room-1', 'user-1')).resolves.toBe(false);
  });

  it('getRole returns OWNER when user is owner', async () => {
    prisma.roomMember.findUnique.mockResolvedValue({ role: RoomRole.OWNER });
    await expect(service.getRole('room-1', 'user-1')).resolves.toBe(RoomRole.OWNER);
  });

  it('getRole returns null when not a member', async () => {
    prisma.roomMember.findUnique.mockResolvedValue(null);
    await expect(service.getRole('room-1', 'user-1')).resolves.toBeNull();
  });
});
