import { Module } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { BlogsController } from './blogs.controller';
import { BlogAuthorGuard } from 'src/common/guards/blog-author.guard';
import { BlogAccessGuard } from 'src/common/guards/blog-access.guard';
import { RoomsModule } from 'src/modules/rooms/rooms.module';
import { RealtimeModule } from 'src/modules/realtime/realtime.module';
import { S3Module } from 'src/s3/s3.module';

@Module({
  imports: [S3Module, RoomsModule, RealtimeModule],
  controllers: [BlogsController],
  providers: [BlogsService, BlogAuthorGuard, BlogAccessGuard],
  exports: [BlogsService],
})
export class BlogsModule {}
