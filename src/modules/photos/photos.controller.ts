import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/common/decorators/current-user.decorator';
import { RoomMemberGuard } from 'src/common/guards/room-member.guard';
import { PhotosService } from './photos.service';
import { RequestPresignedDto } from './dto/request-presigned.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';

const PRESIGNED_EXAMPLE = [
  {
    photoId: 'uuid-photo',
    original: { url: 'https://bucket.s3.amazonaws.com', fields: { key: 'rooms/r1/photos/p1.jpg', policy: '...' }, key: 'rooms/r1/photos/p1.jpg' },
    thumbnail: { url: 'https://bucket.s3.amazonaws.com', fields: { key: 'rooms/r1/thumbs/p1.jpg', policy: '...' }, key: 'rooms/r1/thumbs/p1.jpg' },
  },
];

const PHOTO_EXAMPLE = {
  id: 'uuid-photo',
  roomId: 'uuid-room',
  uploadedBy: 'uuid-user',
  s3Key: 'rooms/uuid-room/photos/uuid-photo.jpg',
  thumbnailKey: 'rooms/uuid-room/thumbs/uuid-photo.jpg',
  fileSize: 5242880,
  width: 4032,
  height: 3024,
  takenAt: '2025-07-15T10:30:00.000Z',
  lat: 37.5665,
  lng: 126.978,
  sceneLabel: null,
  aiCaption: null,
  aiKeywords: [],
  createdAt: '2025-07-15T10:35:00.000Z',
};

@ApiTags('photos')
@ApiBearerAuth()
@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @ApiOperation({ summary: 'S3 Presigned POST URL 요청 (방 멤버 전용)' })
  @ApiResponse({ status: 201, description: 'Presigned URL 목록 반환', schema: { example: PRESIGNED_EXAMPLE } })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Post('presigned-urls')
  async requestPresignedUrls(
    @Body() dto: RequestPresignedDto,
  ) {
    return this.photos.generatePresignedUrls(dto.roomId, dto.files);
  }

  @ApiOperation({ summary: '사진 업로드 완료 알림 — Photo DB 저장 + 클러스터링 (방 멤버 전용)' })
  @ApiResponse({ status: 201, description: '저장 완료, 클러스터링 완료', schema: { example: [PHOTO_EXAMPLE] } })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Post('complete')
  async completeUpload(
    @Body() dto: CompleteUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.photos.complete(dto.roomId, dto.photos, user.id);
  }

  @ApiOperation({ summary: '방의 사진 목록 조회 (방 멤버 전용)' })
  @ApiQuery({ name: 'roomId', required: true, example: 'uuid-room' })
  @ApiResponse({ status: 200, description: '사진 목록', schema: { example: [PHOTO_EXAMPLE] } })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Get()
  async listPhotos(@Query('roomId') roomId: string) {
    return this.photos.findByRoom(roomId);
  }

  @ApiOperation({ summary: '사진 삭제 (방 멤버 전용, roomId 쿼리 파라미터 필수)' })
  @ApiQuery({ name: 'roomId', required: true, example: 'uuid-room' })
  @ApiResponse({ status: 204, description: '삭제 성공' })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Delete(':photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhoto(@Param('photoId') photoId: string) {
    await this.photos.deletePhoto(photoId);
  }
}
