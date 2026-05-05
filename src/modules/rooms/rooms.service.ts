import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RoomRole, TravelRoom, RoomMember } from 'generated/prisma/client';
import { RealtimeService } from 'src/modules/realtime/realtime.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(userId: string, title: string): Promise<TravelRoom> {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.travelRoom.create({
        data: { title, createdBy: userId, inviteToken: crypto.randomUUID() },
      });
      await tx.roomMember.create({
        data: { roomId: room.id, userId, role: RoomRole.OWNER },
      });
      return room;
    });
  }

  findById(
    roomId: string,
  ): Promise<(TravelRoom & { members: RoomMember[] }) | null> {
    return this.prisma.travelRoom.findUnique({
      where: { id: roomId },
      include: { members: true },
    });
  }

  async deleteById(roomId: string): Promise<void> {
    await this.prisma.travelRoom.delete({ where: { id: roomId } });
  }

  async joinByToken(token: string, userId: string): Promise<RoomMember> {
    const room = await this.prisma.travelRoom.findFirst({
      where: { inviteToken: token },
    });
    if (!room) throw new NotFoundException('Invalid invite token');

    const existing = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    });
    if (existing) throw new ConflictException('Already a member');

    const member = await this.prisma.roomMember.create({
      data: { roomId: room.id, userId, role: RoomRole.MEMBER },
    });

    this.realtime.emitToRoom(room.id, 'room:member_joined', { userId });

    return member;
  }

  async regenerateInviteToken(roomId: string): Promise<TravelRoom> {
    return this.prisma.travelRoom.update({
      where: { id: roomId },
      data: { inviteToken: crypto.randomUUID() },
    });
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    return member !== null;
  }

  async getRole(roomId: string, userId: string): Promise<RoomRole | null> {
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    return member?.role ?? null;
  }
}
