import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoomMemberGuard } from 'src/common/guards/room-member.guard';
import { ClustersService } from './clusters.service';
import { UpdateClusterDto } from './dto/update-cluster.dto';

const CLUSTER_EXAMPLE = {
  id: 'uuid-cluster',
  roomId: 'uuid-room',
  title: 'Day 1',
  summary: null,
  sceneLabel: null,
  dayNumber: 1,
  clusterType: 'TIME_GPS',
  thumbnailKey: null,
  createdAt: '2025-07-15T10:35:00.000Z',
  thumbnailUrl: null,
};

const PHOTO_EXAMPLE = {
  id: 'uuid-photo',
  s3Key: 'rooms/uuid-room/photos/uuid-photo.jpg',
  thumbnailKey: 'rooms/uuid-room/thumbs/uuid-photo.jpg',
  takenAt: '2025-07-15T10:30:00.000Z',
  url: 'https://bucket.s3.amazonaws.com/rooms/uuid-room/photos/uuid-photo.jpg?X-Amz-Signature=...',
  thumbnailUrl:
    'https://bucket.s3.amazonaws.com/rooms/uuid-room/thumbs/uuid-photo.jpg?X-Amz-Signature=...',
};

@ApiTags('clusters')
@ApiBearerAuth()
@Controller('clusters')
export class ClustersController {
  constructor(private readonly clusters: ClustersService) {}

  @ApiOperation({ summary: '방의 클러스터 목록 조회 (방 멤버 전용)' })
  @ApiQuery({ name: 'roomId', required: true, example: 'uuid-room' })
  @ApiResponse({
    status: 200,
    description: '클러스터 목록',
    schema: { example: [CLUSTER_EXAMPLE] },
  })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Get()
  async listClusters(@Query('roomId') roomId: string) {
    return this.clusters.findByRoom(roomId);
  }

  @ApiOperation({ summary: '클러스터 제목 수정 (방 멤버 전용)' })
  @ApiResponse({
    status: 200,
    description: '수정 성공',
    schema: { example: CLUSTER_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @ApiResponse({ status: 404, description: '클러스터 없음' })
  @UseGuards(RoomMemberGuard)
  @Patch(':clusterId')
  async updateCluster(
    @Param('clusterId') clusterId: string,
    @Body() dto: UpdateClusterDto,
  ) {
    return this.clusters.updateTitle(clusterId, dto.title);
  }

  @ApiOperation({
    summary:
      '클러스터 내 사진 목록 조회 (방 멤버 전용, roomId 쿼리 파라미터 필수)',
  })
  @ApiQuery({ name: 'roomId', required: true, example: 'uuid-room' })
  @ApiResponse({
    status: 200,
    description: '사진 목록',
    schema: { example: [PHOTO_EXAMPLE] },
  })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Get(':clusterId/photos')
  async getClusterPhotos(@Param('clusterId') clusterId: string) {
    return this.clusters.findPhotosInCluster(clusterId);
  }
}
