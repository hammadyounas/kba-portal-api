import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageService } from './storage.service';

const DEFAULT_ORIGIN = 'https://kba-portal-api.vercel.app/api';

@Injectable()
export class HostedFileService {
  private readonly logger = new Logger(HostedFileService.name);
  private readonly origin: string;

  constructor(private readonly storage: StorageService) {
    this.origin = (process.env.FILE_ORIGIN_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  }

  async read(
    storageKey: string,
    documentId: string,
    authorization?: string,
    mimeType = 'application/octet-stream',
  ): Promise<Buffer> {
    try {
      return await this.storage.getObject(storageKey);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      const copied = await this.copyFromHost(storageKey, documentId, authorization, mimeType);
      if (!copied) throw error;
      return copied;
    }
  }

  private async copyFromHost(
    storageKey: string,
    documentId: string,
    authorization?: string,
    mimeType = 'application/octet-stream',
  ): Promise<Buffer | null> {
    if (process.env.VERCEL || !authorization?.toLowerCase().startsWith('bearer ')) {
      return null;
    }
    let originHost = '';
    try {
      originHost = new URL(this.origin).hostname;
    } catch {
      return null;
    }
    if (originHost === 'localhost' || originHost === '127.0.0.1') return null;

    let response: Response;
    try {
      response = await fetch(`${this.origin}/documents/${encodeURIComponent(documentId)}/file`, {
        headers: { Authorization: authorization },
      });
    } catch (error) {
      this.logger.warn(
        `Hosted archive could not be reached: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
    if (!response.ok) {
      this.logger.warn(`Hosted archive returned ${response.status} for document ${documentId}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return null;
    await this.storage.putObject(storageKey, buffer, mimeType);
    return buffer;
  }
}
