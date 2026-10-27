import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentSource,
  DocumentStatus,
  OcrStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { OcrService } from './ocr.service';
import { PublishedQueryDto } from './dto/published-query.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

const publicDocumentSelect = {
  id: true,
  title: true,
  description: true,
  year: true,
  referenceNumber: true,
  feePkr: true,
  publishedAt: true,
  ocrText: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.DocumentSelect;

type PublicDocumentRow = Prisma.DocumentGetPayload<{
  select: typeof publicDocumentSelect;
}>;

const documentInclude = {
  category: true,
  uploadedBy: {
    select: { id: true, email: true, fullName: true, role: true },
  },
} as const;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_BYTES = 25 * 1024 * 1024;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ocr: OcrService,
  ) {}

  async listForStaff(user: AuthUser) {
    const where =
      user.role === Role.ADMIN
        ? {}
        : { uploadedById: user.id };

    return this.prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: documentInclude,
    });
  }

  async searchPublished(query: PublishedQueryDto) {
    const where = this.publishedWhere(query);
    const [total, rows] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: 50,
        select: publicDocumentSelect,
      }),
    ]);

    return {
      total,
      items: rows.map((row) => this.presentPublic(row, query.q)),
    };
  }

  async getPublished(id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, status: DocumentStatus.PUBLISHED },
      select: publicDocumentSelect,
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const related = await this.prisma.document.findMany({
      where: {
        status: DocumentStatus.PUBLISHED,
        id: { not: doc.id },
        ...(doc.category ? { categoryId: doc.category.id } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: publicDocumentSelect,
    });

    return {
      ...this.presentPublic(doc),
      related: related.map((row) => this.presentPublic(row)),
    };
  }

  async getById(id: string, user: AuthUser) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: documentInclude,
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    this.assertCanManage(doc, user);
    return doc;
  }

  async create(
    user: AuthUser,
    dto: CreateDocumentDto,
    file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('A PDF or image file is required');
    }
    this.assertValidFile(file);

    if (dto.categoryId) {
      await this.assertCategory(dto.categoryId);
    }

    const status =
      dto.status === 'PENDING' ? DocumentStatus.PENDING : DocumentStatus.DRAFT;
    const source =
      dto.source === 'MOBILE_SCAN'
        ? DocumentSource.MOBILE_SCAN
        : DocumentSource.WEB_UPLOAD;

    const storageKey = this.buildStorageKey(file.originalname);
    await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    const reading =
      source === DocumentSource.WEB_UPLOAD
        ? await this.readUploadedFile(file)
        : { ocrText: null, ocrStatus: OcrStatus.NONE };

    return this.prisma.document.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        year: dto.year,
        referenceNumber: dto.referenceNumber?.trim() || null,
        feePkr: dto.feePkr ?? 0,
        status,
        source,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        ocrText: reading.ocrText,
        ocrStatus: reading.ocrStatus,
        categoryId: dto.categoryId || null,
        uploadedById: user.id,
      },
      include: documentInclude,
    });
  }

  async update(id: string, user: AuthUser, dto: UpdateDocumentDto) {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Document not found');
    }
    this.assertCanManage(existing, user);

    if (existing.status === DocumentStatus.PUBLISHED && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can edit published documents');
    }

    if (
      existing.status === DocumentStatus.PUBLISHED &&
      dto.status !== undefined
    ) {
      throw new ForbiddenException(
        'Published documents stay published until an admin reviews them',
      );
    }

    if (dto.categoryId) {
      await this.assertCategory(dto.categoryId);
    }

    const status =
      dto.status === undefined
        ? undefined
        : dto.status === 'PENDING'
          ? DocumentStatus.PENDING
          : DocumentStatus.DRAFT;

    return this.prisma.document.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        year: dto.year,
        referenceNumber:
          dto.referenceNumber === undefined
            ? undefined
            : dto.referenceNumber?.trim() || null,
        feePkr: dto.feePkr,
        categoryId:
          dto.categoryId === undefined ? undefined : dto.categoryId || null,
        status,
        ...(status === DocumentStatus.PENDING
          ? { reviewNote: null, reviewedAt: null }
          : {}),
      },
      include: documentInclude,
    });
  }

  async review(id: string, user: AuthUser, dto: ReviewDocumentDto) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an admin can review documents');
    }

    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Document not found');
    }

    const note = dto.note?.trim() || null;
    const reviewedAt = new Date();

    if (dto.decision === 'PUBLISH') {
      if (
        existing.status !== DocumentStatus.PENDING &&
        existing.status !== DocumentStatus.UNPUBLISHED
      ) {
        throw new BadRequestException(
          'Only a pending or unpublished document can be published',
        );
      }
      return this.prisma.document.update({
        where: { id },
        data: {
          status: DocumentStatus.PUBLISHED,
          publishedAt: reviewedAt,
          reviewNote: null,
          reviewedAt,
        },
        include: documentInclude,
      });
    }

    if (dto.decision === 'UNPUBLISH') {
      if (existing.status !== DocumentStatus.PUBLISHED) {
        throw new BadRequestException('Only a published document can be unpublished');
      }
      return this.prisma.document.update({
        where: { id },
        data: {
          status: DocumentStatus.UNPUBLISHED,
          reviewNote: note,
          reviewedAt,
        },
        include: documentInclude,
      });
    }

    if (existing.status !== DocumentStatus.PENDING) {
      throw new BadRequestException('Only a pending document can be sent back');
    }
    if (!note || note.length < 2) {
      throw new BadRequestException(
        dto.decision === 'REJECT'
          ? 'Add a reason for the rejection'
          : 'Tell staff what to change',
      );
    }

    return this.prisma.document.update({
      where: { id },
      data: {
        status:
          dto.decision === 'REJECT'
            ? DocumentStatus.UNPUBLISHED
            : DocumentStatus.DRAFT,
        reviewNote: note,
        reviewedAt,
      },
      include: documentInclude,
    });
  }

  async replaceFile(id: string, user: AuthUser, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('A PDF or image file is required');
    }
    this.assertValidFile(file);

    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Document not found');
    }
    this.assertCanManage(existing, user);

    const storageKey = this.buildStorageKey(file.originalname);
    await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    const reading = await this.readUploadedFile(file);
    await this.storage.deleteObject(existing.storageKey);

    return this.prisma.document.update({
      where: { id },
      data: {
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        ocrText: reading.ocrText,
        ocrStatus: reading.ocrStatus,
      },
      include: documentInclude,
    });
  }

  async getPrivateFile(id: string, user: AuthUser) {
    const doc = await this.getById(id, user);
    const buffer = await this.storage.getObject(doc.storageKey);
    return {
      buffer,
      mimeType: doc.mimeType,
      originalName: doc.originalName,
    };
  }

  async remove(id: string, user: AuthUser) {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Document not found');
    }
    this.assertCanManage(existing, user);

    if (existing.status === DocumentStatus.PUBLISHED && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can delete published documents');
    }

    await this.prisma.document.delete({ where: { id } });
    await this.storage.deleteObject(existing.storageKey);
    return { deleted: true };
  }

  private async readUploadedFile(file: Express.Multer.File) {
    try {
      const text = await this.ocr.extract(file.buffer, file.mimetype);
      if (!text) {
        return { ocrText: null, ocrStatus: OcrStatus.FAILED };
      }
      return { ocrText: text, ocrStatus: OcrStatus.READY };
    } catch (error) {
      this.logger.warn(
        `OCR failed for ${file.originalname}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return { ocrText: null, ocrStatus: OcrStatus.FAILED };
    }
  }

  private assertValidFile(file: Express.Multer.File) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'Only PDF, JPEG, PNG, or WebP files are allowed',
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File must be 25MB or smaller');
    }
  }

  private async assertCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new BadRequestException('Invalid category');
    }
  }

  private assertCanManage(
    doc: { uploadedById: string },
    user: AuthUser,
  ) {
    if (user.role === Role.ADMIN) return;
    if (user.role === Role.STAFF && doc.uploadedById === user.id) return;
    throw new ForbiddenException('You cannot access this document');
  }

  private publishedWhere(query: PublishedQueryDto): Prisma.DocumentWhereInput {
    const filters: Prisma.DocumentWhereInput[] = [
      { status: DocumentStatus.PUBLISHED },
    ];
    const keyword = query.q?.trim();
    const reference = query.reference?.trim();
    const categories = (query.category ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value && value.toLowerCase() !== 'all categories');

    if (query.year) filters.push({ year: query.year });
    if (reference) {
      filters.push({ referenceNumber: { contains: reference } });
    }
    if (categories.length > 0) {
      filters.push({
        OR: categories.map((value) => ({
          category: {
            OR: [{ slug: value.toLowerCase() }, { name: value }],
          },
        })),
      });
    }
    if (keyword) {
      filters.push({
        OR: [
          { title: { contains: keyword } },
          { description: { contains: keyword } },
          { referenceNumber: { contains: keyword } },
          { ocrText: { contains: keyword } },
        ],
      });
    }

    return { AND: filters };
  }

  private presentPublic(doc: PublicDocumentRow, keyword?: string) {
    return {
      id: doc.id,
      title: doc.title,
      summary: this.publicSummary(doc.description, doc.ocrText, keyword),
      year: doc.year,
      referenceNumber: doc.referenceNumber,
      feePkr: doc.feePkr,
      publishedAt: doc.publishedAt,
      category: doc.category,
    };
  }

  private publicSummary(
    description: string | null,
    ocrText: string | null,
    keyword?: string,
  ) {
    const about = description?.trim();
    if (about) return this.clip(about);
    const text = ocrText?.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const needle = keyword?.trim().toLowerCase();
    if (!needle) return this.clip(text);
    const index = text.toLowerCase().indexOf(needle);
    if (index < 0) return this.clip(text);
    const start = Math.max(0, index - 40);
    const excerpt = text.slice(start, start + 180).trim();
    return `${start > 0 ? '…' : ''}${excerpt}${start + 180 < text.length ? '…' : ''}`;
  }

  private clip(value: string) {
    if (value.length <= 180) return value;
    return `${value.slice(0, 177).trimEnd()}…`;
  }

  private buildStorageKey(originalName: string): string {
    const ext = extname(originalName).toLowerCase() || '.bin';
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `documents/${y}/${m}/${randomUUID()}${ext}`;
  }
}
