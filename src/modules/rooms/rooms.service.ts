import {
  BadRequestException,
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

  private extractTokenFromUrl(inviteUrl: string): string {
    const { pathname } = new URL(inviteUrl);
    const token = pathname.replace(/\/$/, '').split('/').pop();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!token || !uuidRegex.test(token)) {
      throw new BadRequestException('inviteUrl must end with a valid UUID');
    }
    return token;
  }

  async create(
    userId: string,
    inviteUrl: string,
    title?: string,
  ): Promise<TravelRoom> {
    const inviteToken = this.extractTokenFromUrl(inviteUrl);
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.travelRoom.create({
        data: { title, createdBy: userId, inviteToken, inviteUrl },
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

  async regenerateInviteToken(
    roomId: string,
    inviteUrl: string,
  ): Promise<TravelRoom> {
    const inviteToken = this.extractTokenFromUrl(inviteUrl);
    return this.prisma.travelRoom.update({
      where: { id: roomId },
      data: { inviteToken, inviteUrl },
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

  async updateRoom(
    roomId: string,
    data: {
      title: string;
      markerShape?: string;
      markerBgColor?: string;
      markerEmoji?: string;
    },
  ): Promise<TravelRoom> {
    return this.prisma.travelRoom.update({
      where: { id: roomId },
      data,
    });
  }
}
