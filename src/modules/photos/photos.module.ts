import { Module } from '@nestjs/common';
import { S3Module } from 'src/s3/s3.module';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { ClustersModule } from 'src/modules/clusters/clusters.module';
import { RoomsModule } from 'src/modules/rooms/rooms.module';

@Module({
  imports: [S3Module, ClustersModule, RoomsModule],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
