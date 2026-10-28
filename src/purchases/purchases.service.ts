import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUser } from '../auth/types/auth-user.type';
import { Role } from '../common/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { HostedFileService } from '../storage/hosted-file.service';
import { StorageService } from '../storage/storage.service';
import { CheckoutDto } from './dto/checkout.dto';

const DEMO_CARD = '4242424242424242';
const DECLINE_CARD = '4000000000000002';
const DEMO_MOBILE = '03001234567';

const documentSelect = {
  id: true,
  title: true,
  year: true,
  referenceNumber: true,
  feePkr: true,
  category: { select: { id: true, name: true, slug: true } },
} as const;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly hostedFiles: HostedFileService,
  ) {}

  async checkout(user: AuthUser, dto: CheckoutDto) {
    if (user.role !== Role.PUBLIC) {
      throw new ForbiddenException(
        'Purchases are only available to public members.',
      );
    }

    const document = await this.prisma.document.findFirst({
      where: { id: dto.documentId, status: DocumentStatus.PUBLISHED },
      select: documentSelect,
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const existing = await this.prisma.purchase.findFirst({
      where: {
        userId: user.id,
        documentId: document.id,
        status: PaymentStatus.PAID,
      },
      include: { document: { select: documentSelect } },
    });
    if (existing) {
      return this.present(existing, true);
    }

    const verdict = this.verifySandbox(dto);
    const purchase = await this.prisma.purchase.create({
      data: {
        userId: user.id,
        documentId: document.id,
        amountPkr: document.feePkr,
        method: dto.method as PaymentMethod,
        status: verdict.paid ? PaymentStatus.PAID : PaymentStatus.FAILED,
        reference: this.reference(),
        last4: verdict.last4,
        paidAt: verdict.paid ? new Date() : null,
      },
      include: { document: { select: documentSelect } },
    });

    if (!verdict.paid) {
      throw new HttpException(verdict.reason, HttpStatus.PAYMENT_REQUIRED);
    }

    return this.present(purchase, false);
  }

  async listMine(user: AuthUser) {
    const purchases = await this.prisma.purchase.findMany({
      where: { userId: user.id, status: PaymentStatus.PAID },
      orderBy: { paidAt: 'desc' },
      include: { document: { select: documentSelect } },
    });
    return purchases.map((purchase) => this.present(purchase, false));
  }

  async access(user: AuthUser, documentId: string) {
    if (this.readsWithoutPurchase(user)) {
      const document = await this.archiveDocument(documentId);
      if (!document) {
        return { granted: false, title: null, mimeType: null };
      }
      return {
        granted: true,
        title: document.title,
        mimeType: document.mimeType,
      };
    }

    const paid = await this.paidPurchase(user.id, documentId);
    if (!paid) {
      return { granted: false, title: null, mimeType: null };
    }
    return {
      granted: true,
      title: paid.document.title,
      mimeType: paid.document.mimeType,
    };
  }

  async getAuthorizedFile(user: AuthUser, documentId: string, authorization?: string) {
    if (this.readsWithoutPurchase(user)) {
      const document = await this.archiveDocument(documentId);
      if (!document) {
        throw new ForbiddenException('This document is not available to view.');
      }
      const buffer = await this.hostedFiles.read(
        document.storageKey,
        documentId,
        authorization,
        document.mimeType,
      );
      return {
        buffer,
        mimeType: document.mimeType,
        originalName: document.originalName,
        title: document.title,
      };
    }

    const paid = await this.paidPurchase(user.id, documentId);
    if (!paid) {
      throw new ForbiddenException(
        'Payment is required before this document can be viewed.',
      );
    }

    const buffer = await this.hostedFiles.read(
      paid.document.storageKey,
      documentId,
      authorization,
      paid.document.mimeType,
    );
    return {
      buffer,
      mimeType: paid.document.mimeType,
      originalName: paid.document.originalName,
      title: paid.document.title,
    };
  }

  private readsWithoutPurchase(user: AuthUser) {
    return user.role === Role.ADMIN || user.role === Role.STAFF;
  }

  private archiveDocument(documentId: string) {
    return this.prisma.document.findFirst({
      where: { id: documentId },
      select: {
        title: true,
        mimeType: true,
        originalName: true,
        storageKey: true,
      },
    });
  }

  private paidPurchase(userId: string, documentId: string) {
    return this.prisma.purchase.findFirst({
      where: {
        userId,
        documentId,
        status: PaymentStatus.PAID,
      },
      select: {
        id: true,
        document: {
          select: {
            title: true,
            mimeType: true,
            originalName: true,
            storageKey: true,
          },
        },
      },
    });
  }

  private verifySandbox(dto: CheckoutDto): {
    paid: boolean;
    last4: string | null;
    reason: string;
  } {
    if (dto.method === 'CARD') {
      const number = (dto.cardNumber ?? '').replace(/\D/g, '');
      const name = dto.cardName?.trim() ?? '';
      const cvc = dto.cvc?.trim() ?? '';
      if (name.length < 2 || !this.expiryIsValid(dto.expiry ?? '') || !/^\d{3}$/.test(cvc)) {
        throw new BadRequestException('Enter the card name, a future expiry, and a 3-digit CVV.');
      }
      if (number === DECLINE_CARD) {
        return { paid: false, last4: '0002', reason: 'The demo payment was declined.' };
      }
      if (number !== DEMO_CARD) {
        throw new BadRequestException('Use the demo card shown on the checkout page.');
      }
      return { paid: true, last4: '4242', reason: '' };
    }

    const mobile = (dto.mobile ?? '').replace(/\D/g, '');
    if (!/^03\d{9}$/.test(mobile)) {
      throw new BadRequestException('Enter an 11-digit mobile number starting with 03.');
    }
    if (mobile !== DEMO_MOBILE) {
      return {
        paid: false,
        last4: mobile.slice(-4),
        reason: 'The demo wallet payment was declined.',
      };
    }
    return { paid: true, last4: mobile.slice(-4), reason: '' };
  }

  private expiryIsValid(value: string) {
    const match = /^(\d{2})\/(\d{2})$/.exec(value.trim());
    if (!match) return false;
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) return false;
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    return endOfMonth.getTime() >= Date.now();
  }

  private reference() {
    return `KBA-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private present(
    purchase: {
      id: string;
      amountPkr: number;
      method: PaymentMethod;
      status: PaymentStatus;
      reference: string;
      last4: string | null;
      paidAt: Date | null;
      document: {
        id: string;
        title: string;
        year: number | null;
        referenceNumber: string | null;
        feePkr: number;
        category: { id: string; name: string; slug: string } | null;
      };
    },
    alreadyGranted: boolean,
  ) {
    return {
      id: purchase.id,
      amountPkr: purchase.amountPkr,
      method: purchase.method,
      status: purchase.status,
      reference: purchase.reference,
      last4: purchase.last4,
      paidAt: purchase.paidAt,
      alreadyGranted,
      document: purchase.document,
    };
  }
}
