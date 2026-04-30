import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClustersService } from 'src/modules/clusters/clusters.service';
import { Photo } from 'generated/prisma/client';
import { S3Service, PresignedPostResult } from 'src/s3/s3.service';
import type { PresignedFileItem } from './dto/request-presigned.dto';
import type { PhotoCompleteItem } from './dto/complete-upload.dto';

export interface PresignedUrlItem {
  photoId: string;
  original: PresignedPostResult & { key: string };
  thumbnail: PresignedPostResult & { key: string };
}

export type PhotoWithUrls = Photo & {
  url: string;
  thumbnailUrl: string | null;
};

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
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
  ) {}

  async generatePresignedUrls(
    roomId: string,
    files: PresignedFileItem[],
  ): Promise<PresignedUrlItem[]> {
    const maxPhoto = this.s3.getMaxPhotoBytes();
    const maxThumb = this.s3.getMaxThumbBytes();

    return Promise.all(
      files.map(async (file) => {
        const photoId = crypto.randomUUID();
        const ext = extFromContentType(file.contentType);
        const originalKey = `rooms/${roomId}/photos/${photoId}.${ext}`;
        const thumbKey = `rooms/${roomId}/thumbs/${photoId}.${ext}`;

        const [original, thumbnail] = await Promise.all([
          this.s3.createPresignedPhotoPost(
            originalKey,
            maxPhoto,
            ALLOWED_CONTENT_TYPES,
          ),
          this.s3.createPresignedPhotoPost(
            thumbKey,
            maxThumb,
            ALLOWED_CONTENT_TYPES,
          ),
        ]);

        return {
          photoId,
          original: { ...original, key: originalKey },
          thumbnail: { ...thumbnail, key: thumbKey },
        };
      }),
    );
  }

  async complete(
    roomId: string,
    photos: PhotoCompleteItem[],
    uploadedBy?: string,
  ): Promise<PhotoWithUrls[]> {
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

    await this.clusters.rebuildForRoom(roomId, allPhotos);

    const saved = await this.prisma.photo.findMany({
      where: { id: { in: photos.map((p) => p.photoId) } },
      orderBy: { createdAt: 'asc' },
    });

    return Promise.all(saved.map((p) => this.withUrls(p)));
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
