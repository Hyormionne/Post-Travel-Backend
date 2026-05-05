import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClustersService } from 'src/modules/clusters/clusters.service';
import { S3Service } from 'src/s3/s3.service';
import { GpuJobsService } from 'src/modules/gpu-jobs/gpu-jobs.service';
import { RealtimeService } from 'src/modules/realtime/realtime.service';
import { Photo } from 'generated/prisma/client';
import type { PresignedFileItem } from './dto/request-presigned.dto';
import type { PhotoCompleteItem } from './dto/complete-upload.dto';

export interface PresignedUrlItem {
  photoId: string;
  original: { url: string; key: string };
  thumbnail: { url: string; key: string };
}

export type PhotoWithUrls = Photo & {
  url: string;
  thumbnailUrl: string | null;
};

const PHOTO_GET_URL_TTL = 86_400; // 24h

function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[ct] ?? 'jpg';
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly clusters: ClustersService,
    private readonly gpuJobs: GpuJobsService,
    private readonly realtime: RealtimeService,
  ) {}

  async generatePresignedUrls(
    roomId: string,
    files: PresignedFileItem[],
  ): Promise<PresignedUrlItem[]> {
    return Promise.all(
      files.map(async (file) => {
        const photoId = crypto.randomUUID();
        const ext = extFromContentType(file.contentType);
        const originalKey = `rooms/${roomId}/photos/${photoId}.${ext}`;
        const thumbKey = `rooms/${roomId}/thumbs/${photoId}.${ext}`;

        const [originalUrl, thumbnailUrl] = await Promise.all([
          this.s3.createPresignedPutUrl(originalKey, file.contentType),
          this.s3.createPresignedPutUrl(thumbKey, file.contentType),
        ]);

        return {
          photoId,
          original: { url: originalUrl, key: originalKey },
          thumbnail: { url: thumbnailUrl, key: thumbKey },
        };
      }),
    );
  }

  async complete(
    roomId: string,
    photos: PhotoCompleteItem[],
    uploadedBy?: string,
  ): Promise<PhotoWithUrls[]> {
    const requestedPhotoIds = [...new Set(photos.map((p) => p.photoId))];
    const existingOutsideRoom = await this.prisma.photo.findMany({
      where: {
        id: { in: requestedPhotoIds },
        NOT: { roomId },
      },
      select: { id: true },
    });
    if (existingOutsideRoom.length > 0) {
      throw new BadRequestException('Photo ids must belong to the room');
    }

    await this.prisma.photo.createMany({
      data: photos.map((p) => ({
        id: p.photoId,
        roomId,
        uploadedBy: uploadedBy ?? '',
        s3Key: p.s3Key,
        thumbnailKey: p.thumbnailKey,
        fileSize: p.fileSize,
        width: p.width,
        height: p.height,
        takenAt: p.takenAt,
        lat: p.lat,
        lng: p.lng,
        aiKeywords: [],
      })),
      skipDuplicates: true,
    });

    const allPhotos = await this.prisma.photo.findMany({
      where: { roomId },
      select: { id: true, takenAt: true, lat: true, lng: true },
    });

    const clusters = await this.clusters.rebuildForRoom(roomId, allPhotos);

    const saved = await this.prisma.photo.findMany({
      where: { id: { in: requestedPhotoIds }, roomId },
      orderBy: { createdAt: 'asc' },
    });
    if (saved.length !== requestedPhotoIds.length) {
      throw new BadRequestException('Failed to save all requested photos');
    }

    const result = await Promise.all(saved.map((p) => this.withUrls(p)));

    // Fire-and-forget: enqueue failure must not fail the upload response
    this.gpuJobs
      .enqueueVlmJob(
        roomId,
        saved.map((p) => p.id),
      )
      .catch((err: unknown) => {
        console.error('[PhotosService] Failed to enqueue VLM job', err);
      });

    this.realtime.emitToRoom(roomId, 'photo:uploaded', {
      count: result.length,
    });
    for (const cluster of clusters) {
      this.realtime.emitToRoom(roomId, 'cluster:created', {
        clusterId: cluster.id,
        title: cluster.title,
      });
    }

    return result;
  }

  async findByRoom(roomId: string): Promise<PhotoWithUrls[]> {
    const photos = await this.prisma.photo.findMany({
      where: { roomId },
      orderBy: { takenAt: 'asc' },
    });
    return Promise.all(photos.map((p) => this.withUrls(p)));
  }

  async deletePhoto(photoId: string): Promise<void> {
    await this.prisma.photo.delete({ where: { id: photoId } });
  }

  private async withUrls(photo: Photo): Promise<PhotoWithUrls> {
    const [url, thumbnailUrl] = await Promise.all([
      this.s3.getPresignedGetUrl(photo.s3Key, PHOTO_GET_URL_TTL),
      photo.thumbnailKey
        ? this.s3.getPresignedGetUrl(photo.thumbnailKey, PHOTO_GET_URL_TTL)
        : Promise.resolve(null),
    ]);
    return { ...photo, url, thumbnailUrl };
  }
}
