import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Service } from './s3.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
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

  it('createPresignedPutUrl returns signed URL', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue(
      'https://bucket.s3.amazonaws.com/rooms/r1/photos/p1.jpg?X-Amz-Signature=abc',
    );

    const result = await service.createPresignedPutUrl(
      'rooms/r1/photos/p1.jpg',
      'image/jpeg',
    );

    expect(result).toBe(
      'https://bucket.s3.amazonaws.com/rooms/r1/photos/p1.jpg?X-Amz-Signature=abc',
    );
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 300 },
    );
  });

  it('getPresignedGetUrl returns signed URL', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue(
      'https://signed.example.com/photo',
    );

    const result = await service.getPresignedGetUrl(
      'rooms/r1/photos/p1.jpg',
      86400,
    );

    expect(result).toBe('https://signed.example.com/photo');
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 86400 },
    );
  });
});
