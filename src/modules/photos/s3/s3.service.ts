import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import {
  createPresignedPost,
  type PresignedPostOptions,
} from '@aws-sdk/s3-presigned-post';

type ConditionEntry = NonNullable<PresignedPostOptions['Conditions']>[number];

export interface PresignedPostResult {
  url: string;
  fields: Record<string, string>;
}

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

    this.s3Client = new S3Client(clientConfig);
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.expires = config.getOrThrow<number>('S3_PRESIGNED_EXPIRES');
    this.maxPhotoBytes = config.getOrThrow<number>('S3_MAX_PHOTO_BYTES');
    this.maxThumbBytes = config.getOrThrow<number>('S3_MAX_THUMB_BYTES');
  }

  createPresignedPhotoPost(
    key: string,
    maxBytes: number,
    contentTypes: string[],
  ): Promise<PresignedPostResult> {
    const conditions: ConditionEntry[] = [
      ['content-length-range', 1, maxBytes],
      ['starts-with', '$Content-Type', 'image/'],
    ];
    for (const ct of contentTypes) {
      conditions.push(['eq', '$Content-Type', ct] as ['eq', string, string]);
    }

    return createPresignedPost(this.s3Client, {
      Bucket: this.bucket,
      Key: key,
      Expires: this.expires,
      Conditions: conditions,
    });
  }

  getMaxPhotoBytes(): number {
    return this.maxPhotoBytes;
  }

  getMaxThumbBytes(): number {
    return this.maxThumbBytes;
  }
}
