import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { S3Module } from 'src/s3/s3.module';
import { RealtimeModule } from 'src/modules/realtime/realtime.module';
import { GpuJobsService } from './gpu-jobs.service';
import { GpuJobsProcessor } from './gpu-jobs.processor';
import { GpuServerClient } from './gpu-server.client';
import { WebhookController } from './webhook.controller';
import { StalledJobScheduler } from './stalled-job.scheduler';
import { GPU_JOBS_QUEUE } from './gpu-jobs.types';

@Module({
  imports: [
    BullModule.registerQueue({ name: GPU_JOBS_QUEUE }),
    S3Module,
    RealtimeModule,
  ],
  controllers: [WebhookController],
  providers: [
    GpuJobsService,
    GpuJobsProcessor,
    GpuServerClient,
    StalledJobScheduler,
  ],
  exports: [GpuJobsService],
})
export class GpuJobsModule {}
