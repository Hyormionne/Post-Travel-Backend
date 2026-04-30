import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Cluster, ClusterType, Photo } from 'generated/prisma/client';
import { clusterByTimeGps, PhotoInput } from './clustering/time-gps.clustering';

@Injectable()
export class ClustersService {
  constructor(private readonly prisma: PrismaService) {}

  async rebuildForRoom(roomId: string, photos: PhotoInput[]): Promise<Cluster[]> {
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

  findByRoom(roomId: string): Promise<Cluster[]> {
    return this.prisma.cluster.findMany({
      where: { roomId },
      orderBy: [{ dayNumber: 'asc' }, { createdAt: 'asc' }],
    });
  }

  updateTitle(clusterId: string, title: string): Promise<Cluster> {
    return this.prisma.cluster.update({
      where: { id: clusterId },
      data: { title },
    });
  }

  async findPhotosInCluster(clusterId: string): Promise<Photo[]> {
    const records = await this.prisma.clusterPhoto.findMany({
      where: { clusterId },
      include: { photo: true },
    });
    return records.map((r) => r.photo);
  }
}
