// Manual mock for generated/prisma/client — used by Jest unit tests
// to avoid ESM import.meta.url incompatibility in the generated Prisma 7 client.

export class PrismaClient {
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
}

export const RoomRole = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const;
export type RoomRole = (typeof RoomRole)[keyof typeof RoomRole];

export const ClusterType = {
  TIME_GPS: 'TIME_GPS',
  VLM_SCENE: 'VLM_SCENE',
} as const;
export type ClusterType = (typeof ClusterType)[keyof typeof ClusterType];

export const BlogVisibility = {
  PRIVATE: 'PRIVATE',
  ROOM: 'ROOM',
  PUBLIC: 'PUBLIC',
} as const;
export type BlogVisibility =
  (typeof BlogVisibility)[keyof typeof BlogVisibility];

export const JobStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobType = {
  VLM_ANALYZE: 'VLM_ANALYZE',
  LLM_BLOG_DRAFT: 'LLM_BLOG_DRAFT',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];
