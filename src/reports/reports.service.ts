import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  DocumentSource,
  DocumentStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVITY_LIMIT = 20;
const ROW_LIMIT = 12;

type ActivityKind = 'UPLOAD' | 'PUBLISH' | 'PURCHASE' | 'PAYMENT_FAILED';

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [
      statusGroups,
      sourceGroups,
      paidFees,
      paidCount,
      failedCount,
      uploads,
      published,
      purchases,
      pendingStaff,
    ] = await Promise.all([
      this.prisma.document.groupBy({ by: ['status'], _count: true }),
      this.prisma.document.groupBy({ by: ['source'], _count: true }),
      this.prisma.purchase.aggregate({
        where: { status: PaymentStatus.PAID },
        _sum: { amountPkr: true },
      }),
      this.prisma.purchase.count({ where: { status: PaymentStatus.PAID } }),
      this.prisma.purchase.count({ where: { status: PaymentStatus.FAILED } }),
      this.prisma.document.findMany({
        orderBy: { createdAt: 'desc' },
        take: ROW_LIMIT,
        select: documentSelect,
      }),
      this.prisma.document.findMany({
        where: { status: DocumentStatus.PUBLISHED },
        orderBy: { publishedAt: 'desc' },
        take: ROW_LIMIT,
        select: documentSelect,
      }),
      this.prisma.purchase.findMany({
        orderBy: { createdAt: 'desc' },
        take: ROW_LIMIT,
        select: purchaseSelect,
      }),
      this.prisma.user.count({
        where: { role: Role.STAFF, accountStatus: AccountStatus.PENDING },
      }),
    ]);

    const statusCount = (status: DocumentStatus) =>
      statusGroups.find((group) => group.status === status)?._count ?? 0;
    const sourceCount = (source: DocumentSource) =>
      sourceGroups.find((group) => group.source === source)?._count ?? 0;

    const recentUploads = uploads.map((row) => this.documentRow(row));
    const recentPublished = published.map((row) => this.documentRow(row));
    const recentPurchases = purchases.map((row) => this.purchaseRow(row));

    return {
      generatedAt: new Date().toISOString(),
      uploads: {
        total: sourceCount(DocumentSource.WEB_UPLOAD) + sourceCount(DocumentSource.MOBILE_SCAN),
        web: sourceCount(DocumentSource.WEB_UPLOAD),
        mobile: sourceCount(DocumentSource.MOBILE_SCAN),
      },
      documents: {
        draft: statusCount(DocumentStatus.DRAFT),
        pending: statusCount(DocumentStatus.PENDING),
        published: statusCount(DocumentStatus.PUBLISHED),
        unpublished: statusCount(DocumentStatus.UNPUBLISHED),
      },
      purchases: { paid: paidCount, failed: failedCount },
      fees: { collectedPkr: paidFees._sum.amountPkr ?? 0 },
      pendingStaff,
      activity: this.activity(uploads, published, purchases),
      recentUploads,
      recentPublished,
      recentPurchases,
    };
  }

  private activity(
    uploads: DocumentRow[],
    published: DocumentRow[],
    purchases: PurchaseRow[],
  ): ActivityItem[] {
    const items: ActivityItem[] = [
      ...uploads.map((row) => ({
        id: `upload:${row.id}`,
        kind: 'UPLOAD' as const,
        at: row.createdAt.toISOString(),
        title: row.title,
        detail: `${this.sourceLabel(row.source)} · ${row.uploadedBy.fullName}`,
      })),
      ...published.flatMap((row) =>
        row.publishedAt
          ? [
              {
                id: `publish:${row.id}`,
                kind: 'PUBLISH' as const,
                at: row.publishedAt.toISOString(),
                title: row.title,
                detail: `Listed for the public · ${this.money(row.feePkr)}`,
              },
            ]
          : [],
      ),
      ...purchases.map((row) => ({
        id: `purchase:${row.id}`,
        kind: row.status === PaymentStatus.PAID ? ('PURCHASE' as const) : ('PAYMENT_FAILED' as const),
        at: (row.paidAt ?? row.createdAt).toISOString(),
        title: row.document.title,
        detail:
          row.status === PaymentStatus.PAID
            ? `${this.money(row.amountPkr)} · ${this.methodLabel(row.method)} · ${row.user.fullName}`
            : `Declined · ${this.methodLabel(row.method)} · ${row.user.fullName}`,
      })),
    ];

    return items
      .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
      .slice(0, ACTIVITY_LIMIT);
  }

  private documentRow(row: DocumentRow) {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      source: row.source,
      feePkr: row.feePkr,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      uploadedBy: row.uploadedBy.fullName,
    };
  }

  private purchaseRow(row: PurchaseRow) {
    return {
      id: row.id,
      amountPkr: row.amountPkr,
      method: row.method,
      status: row.status,
      at: (row.paidAt ?? row.createdAt).toISOString(),
      reference: row.reference,
      buyer: row.user.fullName,
      documentId: row.document.id,
      documentTitle: row.document.title,
    };
  }

  private sourceLabel(source: DocumentSource) {
    return source === DocumentSource.MOBILE_SCAN ? 'Mobile scan' : 'Web upload';
  }

  private methodLabel(method: PaymentMethod) {
    if (method === PaymentMethod.JAZZCASH) return 'JazzCash';
    if (method === PaymentMethod.EASYPAISA) return 'easypaisa';
    return 'Card';
  }

  private money(amount: number) {
    return `PKR ${amount.toLocaleString('en-PK')}`;
  }
}

const documentSelect = {
  id: true,
  title: true,
  status: true,
  source: true,
  feePkr: true,
  createdAt: true,
  publishedAt: true,
  uploadedBy: { select: { fullName: true } },
} as const;

const purchaseSelect = {
  id: true,
  amountPkr: true,
  method: true,
  status: true,
  createdAt: true,
  paidAt: true,
  reference: true,
  user: { select: { fullName: true } },
  document: { select: { id: true, title: true } },
} as const;

type DocumentRow = {
  id: string;
  title: string;
  status: DocumentStatus;
  source: DocumentSource;
  feePkr: number;
  createdAt: Date;
  publishedAt: Date | null;
  uploadedBy: { fullName: string };
};

type PurchaseRow = {
  id: string;
  amountPkr: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: Date;
  paidAt: Date | null;
  reference: string;
  user: { fullName: string };
  document: { id: string; title: string };
};
