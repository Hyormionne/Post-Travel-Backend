import { Module } from '@nestjs/common';
import { S3Service } from './s3/s3.service';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { ClustersModule } from 'src/modules/clusters/clusters.module';
import { RoomsModule } from 'src/modules/rooms/rooms.module';

@Module({
  imports: [ClustersModule, RoomsModule],
  controllers: [PhotosController],
  providers: [S3Service, PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
