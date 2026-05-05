import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emitToRoom(roomId: string, event: string, data: unknown): void {
    this.server?.to(`travel_room:${roomId}`).emit(event, data);
  }
}
