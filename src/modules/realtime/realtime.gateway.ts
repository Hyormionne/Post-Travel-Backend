import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from './realtime.service';
import { WsJwtGuard } from 'src/common/guards/ws-jwt.guard';
import type { AppEnv } from 'src/config/config.types';

interface JwtPayload {
  sub: string;
}

@WebSocketGateway({ namespace: '/realtime', cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppEnv>,
    private readonly realtimeService: RealtimeService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.realtimeService.setServer(server);
  }

  handleConnection(client: Socket): void {
    const auth = client.handshake.auth;
    const raw = auth.token as string | undefined;
    if (!raw) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(
        raw.replace('Bearer ', ''),
        { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') },
      );
      (client.data as { userId: string }).userId = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('room:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId: string },
  ): Promise<void> {
    if (!body?.roomId) throw new WsException('roomId is required');

    const member = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: body.roomId,
          userId: (client.data as { userId: string }).userId,
        },
      },
    });
    if (!member) throw new WsException('Not a member of this room');

    void client.join(`travel_room:${body.roomId}`);
  }
}
