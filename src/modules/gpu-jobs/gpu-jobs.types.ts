export const GPU_JOBS_QUEUE = 'gpu-jobs' as const;

export interface GpuJobPayload {
  processingJobId: string;
  roomId: string;
  photoIds: string[];
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
