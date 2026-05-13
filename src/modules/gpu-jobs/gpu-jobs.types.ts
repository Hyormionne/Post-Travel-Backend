export const GPU_JOBS_QUEUE = 'gpu-jobs' as const;

export interface GpuJobPayload {
  processingJobId: string;
  roomId: string;
  photoIds: string[];
  persona?: string;
}

export interface VlmPhotoItem {
  photo_id: string;
  url: string;
}

export interface VlmAnalyzeRequest {
  job_id: string;
  photos: VlmPhotoItem[];
  callback_url: string;
}

export interface BlogPhotoItem {
  photo_id: string;
  url: string;
  taken_at: string | null;
  lat: number | null;
  lng: number | null;
  scene_label: string | null;
}

export interface BlogGenerateRequest {
  job_id: string;
  photos: BlogPhotoItem[];
  callback_url: string;
  persona?: string;
}

export interface EnqueueBlogJobInput {
  roomId: string;
  authorId: string;
  photoIds: string[];
  persona?: string;
}
