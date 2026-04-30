import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Cluster, ClusterType, Photo } from 'generated/prisma/client';
import { S3Service } from 'src/s3/s3.service';
import { clusterByTimeGps, PhotoInput } from './clustering/time-gps.clustering';

type PhotoWithUrls = Photo & { url: string; thumbnailUrl: string | null };
type ClusterWithThumbnailUrl = Cluster & { thumbnailUrl: string | null };

const PHOTO_GET_URL_TTL = 86_400; // 24h

@Injectable()
export class ClustersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async rebuildForRoom(
    roomId: string,
    photos: PhotoInput[],
  ): Promise<Cluster[]> {
    const groups = clusterByTimeGps(photos);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.cluster.findMany({
        where: { roomId, clusterType: ClusterType.TIME_GPS },
        select: { id: true },
      });
      const existingIds = existing.map((c) => c.id);

      if (existingIds.length > 0) {
        await tx.clusterPhoto.deleteMany({
          where: { clusterId: { in: existingIds } },
        });
      }

      await tx.cluster.deleteMany({
        where: { roomId, clusterType: ClusterType.TIME_GPS },
      });

      const created: Cluster[] = [];
      for (const group of groups) {
        const cluster = await tx.cluster.create({
          data: {
            roomId,
            title: group.title,
            dayNumber: group.dayNumber,
            clusterType: ClusterType.TIME_GPS,
          },
        });
        if (group.photoIds.length > 0) {
          await tx.clusterPhoto.createMany({
            data: group.photoIds.map((photoId) => ({
              clusterId: cluster.id,
              photoId,
            })),
          });
        }
        created.push(cluster);
      }

      return created;
    });
  }

  async findByRoom(roomId: string): Promise<ClusterWithThumbnailUrl[]> {
    const clusters = await this.prisma.cluster.findMany({
      where: { roomId },
      orderBy: [{ dayNumber: 'asc' }, { createdAt: 'asc' }],
    });
    return Promise.all(
      clusters.map(async (c) => ({
        ...c,
        thumbnailUrl: c.thumbnailKey
          ? await this.s3.getPresignedGetUrl(c.thumbnailKey, PHOTO_GET_URL_TTL)
          : null,
      })),
    );
  }

  updateTitle(clusterId: string, title: string): Promise<Cluster> {
    return this.prisma.cluster.update({
      where: { id: clusterId },
      data: { title },
    });
  }

  async findPhotosInCluster(clusterId: string): Promise<PhotoWithUrls[]> {
    const records = await this.prisma.clusterPhoto.findMany({
      where: { clusterId },
      include: { photo: true },
    });
    return Promise.all(records.map((r) => this.photoWithUrls(r.photo)));
  }

  private async photoWithUrls(photo: Photo): Promise<PhotoWithUrls> {
    const [url, thumbnailUrl] = await Promise.all([
      this.s3.getPresignedGetUrl(photo.s3Key, PHOTO_GET_URL_TTL),
      photo.thumbnailKey
        ? this.s3.getPresignedGetUrl(photo.thumbnailKey, PHOTO_GET_URL_TTL)
        : Promise.resolve(null),
    ]);
    return { ...photo, url, thumbnailUrl };
  }
}
