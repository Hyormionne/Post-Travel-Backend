import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/common/decorators/current-user.decorator';
import { RoomMemberGuard } from 'src/common/guards/room-member.guard';
import { RoomOwnerGuard } from 'src/common/guards/room-owner.guard';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';

const ROOM_EXAMPLE = {
  id: 'uuid-room',
  title: '제주도 여행 2025',
  inviteToken: 'uuid-token',
  createdBy: 'uuid-user',
  createdAt: '2025-07-01T00:00:00.000Z',
  members: [{ id: 'uuid-member', roomId: 'uuid-room', userId: 'uuid-user', role: 'OWNER', joinedAt: '2025-07-01T00:00:00.000Z' }],
};

@ApiTags('rooms')
@ApiBearerAuth()
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @ApiOperation({ summary: 'Travel Room 생성' })
  @ApiResponse({ status: 201, description: '생성 성공', schema: { example: ROOM_EXAMPLE } })
  @Post()
  async createRoom(
    @Body() dto: CreateRoomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rooms.create(user.id, dto.title);
  }

  @ApiOperation({ summary: '초대 토큰으로 방 참가 (JWT 필수)' })
  @ApiResponse({ status: 200, description: '참가 성공', schema: { example: { id: 'uuid-member', roomId: 'uuid-room', userId: 'uuid-user', role: 'MEMBER', joinedAt: '2025-07-01T00:00:00.000Z' } } })
  @ApiResponse({ status: 404, description: '유효하지 않은 토큰' })
  @ApiResponse({ status: 409, description: '이미 멤버' })
  @Get('join/:token')
  async joinRoom(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rooms.joinByToken(token, user.id);
  }

  @ApiOperation({ summary: 'Room 상세 조회 (방 멤버 전용)' })
  @ApiResponse({ status: 200, description: '조회 성공', schema: { example: ROOM_EXAMPLE } })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @ApiResponse({ status: 404, description: '방 없음' })
  @UseGuards(RoomMemberGuard)
  @Get(':roomId')
  async getRoom(@Param('roomId') roomId: string) {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  @ApiOperation({ summary: 'Room 삭제 (OWNER 전용)' })
  @ApiResponse({ status: 204, description: '삭제 성공' })
  @ApiResponse({ status: 403, description: 'OWNER 아님' })
  @UseGuards(RoomOwnerGuard)
  @Delete(':roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRoom(@Param('roomId') roomId: string) {
    await this.rooms.deleteById(roomId);
  }

  @ApiOperation({ summary: '초대 토큰 재발급 (OWNER 전용)' })
  @ApiResponse({ status: 201, description: '재발급 성공', schema: { example: { inviteToken: 'new-uuid-token' } } })
  @ApiResponse({ status: 403, description: 'OWNER 아님' })
  @UseGuards(RoomOwnerGuard)
  @Post(':roomId/invite-token')
  async regenerateToken(@Param('roomId') roomId: string) {
    const room = await this.rooms.regenerateInviteToken(roomId);
    return { inviteToken: room.inviteToken };
  }
}
