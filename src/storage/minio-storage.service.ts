import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import {
  ObjectStorage,
  StoredObject,
  StoredObjectMeta,
} from './storage.types';

@Injectable()
export class MinioStorageService implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfigService) {
    const endpoint = config.getOrThrow('MINIO_ENDPOINT');
    const region = config.get<string>('MINIO_REGION') ?? 'us-east-1';

    this.bucket = config.getOrThrow('MINIO_BUCKET');
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow('MINIO_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow('MINIO_SECRET_KEY'),
      },
    });
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, sizeBytes: body.length };
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) {
        throw new NotFoundException('File not found in storage');
      }
      return Buffer.from(bytes);
    } catch {
      throw new NotFoundException('File not found in storage');
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getMeta(key: string): Promise<StoredObjectMeta> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        sizeBytes: head.ContentLength ?? 0,
        exists: true,
      };
    } catch {
      return { key, sizeBytes: 0, exists: false };
    }
  }
}
