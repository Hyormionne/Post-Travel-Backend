import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from 'src/config/config.types';
import { GpuServerClient } from './gpu-server.client';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GpuServerClient', () => {
  let client: GpuServerClient;
  let mockPost: jest.Mock;

  beforeEach(() => {
    mockPost = jest.fn().mockResolvedValue({ status: 200 });
    mockedAxios.post = mockPost;

    const config = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        const map: Record<string, string> = {
          GPU_SERVER_URL: 'http://gpu.test',
          GPU_INTERNAL_TOKEN: 'secret',
        };
        return map[key] ?? '';
      }),
    } as unknown as ConfigService<AppEnv>;
    client = new GpuServerClient(config);
  });

  it('calls GPU /vlm/analyze with X-Internal-Token header', async () => {
    await client.callVlmAnalyze({
      job_id: 'job-1',
      photos: [{ photo_id: 'p1', url: 'https://s3.test/p.jpg' }],
      callback_url: 'http://host/internal/jobs/job-1/callback',
    });

    expect(mockPost).toHaveBeenCalledWith(
      'http://gpu.test/vlm/analyze',
      expect.objectContaining({
        job_id: 'job-1',
        photos: [{ photo_id: 'p1', url: 'https://s3.test/p.jpg' }],
      }),
      expect.objectContaining({ headers: { 'X-Internal-Token': 'secret' } }),
    );
  });
});
