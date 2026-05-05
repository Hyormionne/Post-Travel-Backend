import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { envSchema } from './config/env.schema';
import type { AppEnv } from './config/config.types';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './health/health.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { PhotosModule } from './modules/photos/photos.module';
import { ClustersModule } from './modules/clusters/clusters.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { GpuJobsModule } from './modules/gpu-jobs/gpu-jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService<AppEnv>) => ({
        connection: {
          host: c.getOrThrow('REDIS_HOST'),
          port: c.getOrThrow<number>('REDIS_PORT'),
          password: c.get('REDIS_PASSWORD'),
        },
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    UsersModule,
    AuthModule,
    HealthModule,
    RoomsModule,
    PhotosModule,
    ClustersModule,
    RealtimeModule,
    GpuJobsModule,
  ],
})
export class AppModule {}
