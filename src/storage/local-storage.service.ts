import { Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { access, unlink, writeFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import {
  ObjectStorage,
  StoredObject,
  StoredObjectMeta,
} from './storage.types';

@Injectable()
export class LocalStorageService implements ObjectStorage {
  private readonly root: string;

  constructor(config: AppConfigService) {
    const configured = config.get<string>('STORAGE_LOCAL_ROOT');
    this.root = process.env.VERCEL
      ? join(tmpdir(), 'kba-private')
      : (configured ?? join(process.cwd(), 'storage', 'private'));
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  private resolvePath(key: string): string {
    const safeKey = key.replace(/^\/+/, '').replace(/\.\./g, '');
    return join(this.root, safeKey);
  }

  async putObject(
    key: string,
    body: Buffer,
    _contentType: string,
  ): Promise<StoredObject> {
    const fullPath = this.resolvePath(key);
    mkdirSync(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, body);
    return { key, sizeBytes: body.length };
  }

  async getObject(key: string): Promise<Buffer> {
    const fullPath = this.resolvePath(key);
    try {
      await access(fullPath);
    } catch {
      throw new NotFoundException('File not found in storage');
    }
    const chunks: Buffer[] = [];
    const stream = createReadStream(fullPath);
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = this.resolvePath(key);
    try {
      await unlink(fullPath);
    } catch {
      // ignore missing
    }
  }

  async getMeta(key: string): Promise<StoredObjectMeta> {
    const fullPath = this.resolvePath(key);
    try {
      const info = await stat(fullPath);
      return { key, sizeBytes: info.size, exists: true };
    } catch {
      return { key, sizeBytes: 0, exists: false };
    }
  }

  /** Stream helper for large files (future PDF viewer) */
  async streamTo(key: string, destination: NodeJS.WritableStream) {
    const fullPath = this.resolvePath(key);
    await pipeline(createReadStream(fullPath), destination);
  }

  async putFromStream(
    key: string,
    source: NodeJS.ReadableStream,
  ): Promise<void> {
    const fullPath = this.resolvePath(key);
    mkdirSync(dirname(fullPath), { recursive: true });
    await pipeline(source, createWriteStream(fullPath));
  }
}
