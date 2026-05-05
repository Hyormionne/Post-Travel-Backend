import { Module } from '@nestjs/common';
import { S3Module } from 'src/s3/s3.module';
import { ClustersService } from './clusters.service';
import { ClustersController } from './clusters.controller';
import { RoomsModule } from 'src/modules/rooms/rooms.module';
import { RealtimeModule } from 'src/modules/realtime/realtime.module';

@Module({
  imports: [S3Module, RoomsModule, RealtimeModule],
  controllers: [ClustersController],
  providers: [ClustersService],
  exports: [ClustersService],
})
export class ClustersModule {}
