import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly expires: number;
  private readonly maxPhotoBytes: number;
  private readonly maxThumbBytes: number;

  constructor(private readonly config: ConfigService) {
    const clientConfig: S3ClientConfig = {
      region: config.getOrThrow<string>('AWS_REGION'),
    };

    const endpoint = config.get<string>('S3_ENDPOINT');
    const keyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secret = config.get<string>('AWS_SECRET_ACCESS_KEY');

    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = true;
    }
    if (keyId && secret) {
      clientConfig.credentials = {
        accessKeyId: keyId,
        secretAccessKey: secret,
      };
    }

    this.s3Client = new S3Client({
      ...clientConfig,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.expires = config.getOrThrow<number>('S3_PRESIGNED_EXPIRES');
    this.maxPhotoBytes = config.getOrThrow<number>('S3_MAX_PHOTO_BYTES');
    this.maxThumbBytes = config.getOrThrow<number>('S3_MAX_THUMB_BYTES');
  }

  createPresignedPutUrl(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.s3Client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: this.expires },
    );
  }

  getPresignedGetUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.s3Client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  getMaxPhotoBytes(): number {
    return this.maxPhotoBytes;
  }

  getMaxThumbBytes(): number {
    return this.maxThumbBytes;
  }
}
