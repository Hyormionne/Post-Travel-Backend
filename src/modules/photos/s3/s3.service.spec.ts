/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { S3Service } from './s3.service';

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(),
}));

const mockConfig = {
  getOrThrow: (key: string) =>
    ({
      AWS_REGION: 'ap-northeast-2',
      S3_BUCKET: 'test-bucket',
      S3_PRESIGNED_EXPIRES: 300,
      S3_MAX_PHOTO_BYTES: 20971520,
      S3_MAX_THUMB_BYTES: 512000,
    })[key],
  get: (key: string) =>
    ({
      S3_ENDPOINT: undefined,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
    })[key],
} as unknown as ConfigService;

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new S3Service(mockConfig);
  });

  it('createPresignedPhotoPost returns url and fields', async () => {
    (createPresignedPost as jest.Mock).mockResolvedValue({
      url: 'https://bucket.s3.amazonaws.com',
      fields: { key: 'test-key', policy: 'abc' },
    });

    const result = await service.createPresignedPhotoPost(
      'rooms/r1/photos/p1.jpg',
      20971520,
      ['image/jpeg', 'image/png', 'image/webp'],
    );

    expect(result.url).toBe('https://bucket.s3.amazonaws.com');
    expect(result.fields).toMatchObject({ key: 'test-key' });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'rooms/r1/photos/p1.jpg',
        Expires: 300,
        Conditions: expect.arrayContaining([
          ['content-length-range', 1, 20971520],
        ]),
      }),
    );
  });
});
