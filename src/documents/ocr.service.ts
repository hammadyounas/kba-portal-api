import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker, type Worker } from 'tesseract.js';
import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';
import { mkdirSync } from 'fs';
import { join } from 'path';

const CACHE_PATH = join(process.cwd(), 'storage', 'tesseract');
const MAX_PAGES = 3;
const MAX_TEXT = 20_000;
const MIN_EMBEDDED_CHARS = 20;

@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private engine: Promise<Worker> | null = null;
  private chain: Promise<void> = Promise.resolve();

  async extract(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      return this.extractPdf(buffer);
    }
    if (
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      mimeType === 'image/webp'
    ) {
      return this.extractImage(buffer);
    }
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  async onModuleDestroy() {
    const pending = this.engine;
    this.engine = null;
    if (!pending) return;
    const worker = await pending.catch(() => null);
    await worker?.terminate();
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
      const extracted = await extractText(pdf, { mergePages: true });
      const embedded = this.clean(
        typeof extracted.text === 'string' ? extracted.text : '',
      );
      if (this.letterCount(embedded) >= MIN_EMBEDDED_CHARS) {
        return embedded;
      }

      const pages = Math.min(extracted.totalPages, MAX_PAGES);
      const parts: string[] = [];
      for (let page = 1; page <= pages; page += 1) {
        const rendered = await renderPageAsImage(pdf, page, {
          width: 1400,
          canvasImport: () => import('@napi-rs/canvas'),
        });
        parts.push(await this.recognize(Buffer.from(rendered)));
      }
      return this.clean(parts.filter(Boolean).join('\n\n'));
    } finally {
      await pdf.cleanup();
      await pdf.loadingTask.destroy();
    }
  }

  private async extractImage(buffer: Buffer): Promise<string> {
    try {
      return this.clean(await this.recognize(await this.toPng(buffer)));
    } catch (error) {
      this.logger.warn(
        `Image normalize failed, reading the original file: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return this.clean(await this.recognize(buffer));
    }
  }

  private async toPng(buffer: Buffer): Promise<Buffer> {
    const image = await loadImage(buffer);
    const longest = Math.max(image.width, image.height);
    const scale = longest > 1800 ? 1800 / longest : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toBuffer('image/png');
  }

  private recognize(image: Buffer): Promise<string> {
    const run = this.chain.then(async () => {
      const worker = await this.worker();
      const result = await worker.recognize(image);
      return result.data.text ?? '';
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private worker() {
    if (!this.engine) {
      mkdirSync(CACHE_PATH, { recursive: true });
      const pending = createWorker('eng', undefined, {
        cachePath: CACHE_PATH,
      })
        .then(async (worker) => {
          await worker.setParameters({ user_defined_dpi: '300' });
          return worker;
        })
        .catch((error: unknown) => {
          if (this.engine === pending) this.engine = null;
          throw error;
        });
      this.engine = pending;
    }
    return this.engine;
  }

  private clean(value: string) {
    return value
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_TEXT);
  }

  private letterCount(value: string) {
    return value.replace(/[^A-Za-z0-9]/g, '').length;
  }
}
