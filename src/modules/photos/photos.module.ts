import { Module } from '@nestjs/common';
import { S3Module } from 'src/s3/s3.module';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { ClustersModule } from 'src/modules/clusters/clusters.module';
import { RoomsModule } from 'src/modules/rooms/rooms.module';
import { GpuJobsModule } from 'src/modules/gpu-jobs/gpu-jobs.module';
import { RealtimeModule } from 'src/modules/realtime/realtime.module';

@Module({
  imports: [
    S3Module,
    ClustersModule,
    RoomsModule,
    GpuJobsModule,
    RealtimeModule,
  ],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
