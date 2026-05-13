import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { BlogAuthorGuard } from 'src/common/guards/blog-author.guard';
import { BlogAccessGuard } from 'src/common/guards/blog-access.guard';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { GenerateBlogDto } from './dto/generate-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';

const BLOG_EXAMPLE = {
  id: 'uuid-blog',
  roomId: 'uuid-room',
  authorId: 'uuid-user',
  title: 'Day 1 in Jeju',
  content: '오늘은 제주도 첫날...',
  visibility: 'ROOM',
  publishedAt: null,
  createdAt: '2026-05-07T12:00:00.000Z',
  updatedAt: '2026-05-07T12:00:00.000Z',
  photos: [],
};

@ApiTags('blogs')
@ApiBearerAuth()
@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogs: BlogsService) {}

  @ApiOperation({ summary: '블로그 생성 (방 멤버 전용)' })
  @ApiResponse({ status: 201, schema: { example: BLOG_EXAMPLE } })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBlogDto,
  ) {
    return this.blogs.create(user.id, dto);
  }

  @ApiOperation({ summary: '방의 블로그 목록 조회 (방 멤버 전용)' })
  @ApiQuery({ name: 'roomId', required: true, example: 'uuid-room' })
  @ApiResponse({ status: 200, schema: { example: [BLOG_EXAMPLE] } })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Get()
  async findByRoom(@Query('roomId') roomId: string) {
    return this.blogs.findByRoom(roomId);
  }

  @ApiOperation({ summary: 'AI 블로그 초안 생성 요청 (방 멤버 전용)' })
  @ApiResponse({
    status: 201,
    schema: { example: { jobId: 'uuid-job', status: 'PENDING' } },
  })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(RoomMemberGuard)
  @Post(':roomId/generate')
  async generateFromRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomId') roomId: string,
    @Body() dto: GenerateBlogDto,
  ) {
    return this.blogs.generateFromRoom(roomId, user.id, dto);
  }

  @ApiOperation({ summary: '블로그 단건 조회 (방 멤버 전용)' })
  @ApiResponse({ status: 200, schema: { example: BLOG_EXAMPLE } })
  @ApiResponse({ status: 403, description: '방 멤버 아님' })
  @UseGuards(BlogAccessGuard)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.blogs.findOne(id);
  }

  @ApiOperation({ summary: '블로그 수정 (작성자 전용)' })
  @ApiResponse({ status: 200, schema: { example: BLOG_EXAMPLE } })
  @ApiResponse({ status: 403, description: '작성자 아님' })
  @UseGuards(BlogAuthorGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBlogDto) {
    return this.blogs.update(id, dto);
  }

  @ApiOperation({ summary: '블로그 발행 (작성자 전용)' })
  @ApiResponse({
    status: 201,
    schema: {
      example: { ...BLOG_EXAMPLE, publishedAt: '2026-05-07T12:00:00.000Z' },
    },
  })
  @ApiResponse({ status: 403, description: '작성자 아님' })
  @UseGuards(BlogAuthorGuard)
  @Post(':id/publish')
  async publish(@Param('id') id: string) {
    return this.blogs.publish(id);
  }

  @ApiOperation({ summary: '블로그 삭제 (작성자 전용)' })
  @ApiResponse({ status: 204, description: '삭제 완료' })
  @ApiResponse({ status: 403, description: '작성자 아님' })
  @UseGuards(BlogAuthorGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.blogs.remove(id);
  }
}
