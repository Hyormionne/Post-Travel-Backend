import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { AppEnv } from 'src/config/config.types';
import type { BlogGenerateRequest, VlmAnalyzeRequest } from './gpu-jobs.types';

@Injectable()
export class GpuServerClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService<AppEnv>) {
    this.baseUrl = config.getOrThrow('GPU_SERVER_URL');
    this.token = config.getOrThrow('GPU_INTERNAL_TOKEN');
  }

  async callVlmAnalyze(req: VlmAnalyzeRequest): Promise<void> {
    await axios.post(`${this.baseUrl}/vlm/analyze`, req, {
      headers: { 'X-Internal-Token': this.token },
      timeout: 10_000,
    });
  }

  async callBlogGenerate(req: BlogGenerateRequest): Promise<void> {
    await axios.post(`${this.baseUrl}/blog/generate`, req, {
      headers: { 'X-Internal-Token': this.token },
      timeout: 10_000,
    });
  }
}
