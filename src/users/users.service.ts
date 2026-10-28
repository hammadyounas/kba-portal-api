import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus, Role } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { InviteStaffDto } from './dto/invite-staff.dto';

const STATUS_ORDER: Record<AccountStatus, number> = {
  PENDING: 0,
  REJECTED: 1,
  BLOCKED: 2,
  ACTIVE: 3,
};

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const staffSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  accountStatus: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async listStaff() {
    const staff = await this.prisma.user.findMany({
      where: { role: Role.STAFF },
      select: staffSelect,
    });

    return staff
      .sort((left, right) => {
        const byStatus =
          STATUS_ORDER[left.accountStatus] - STATUS_ORDER[right.accountStatus];
        if (byStatus !== 0) return byStatus;
        return right.createdAt.getTime() - left.createdAt.getTime();
      })
      .map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }));
  }

  async listInvites() {
    const invites = await this.prisma.staffInvite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
    });

    const now = Date.now();
    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      fullName: invite.fullName,
      phone: invite.phone,
      expiresAt: invite.expiresAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      status: invite.acceptedAt
        ? 'ACCEPTED'
        : invite.expiresAt.getTime() < now
          ? 'EXPIRED'
          : 'PENDING',
    }));
  }

  async invite(invitedById: string, dto: InviteStaffDto, origin?: string) {
    const email = dto.email.toLowerCase().trim();
    const fullName = dto.fullName.trim();
    const phone = dto.phone.trim();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      throw new BadRequestException('Enter a valid phone number');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const open = await this.prisma.staffInvite.findFirst({
      where: { email, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (open) {
      await this.prisma.staffInvite.deleteMany({
        where: { email, acceptedAt: null, id: { not: open.id } },
      });
    }

    const saved = open
      ? await this.prisma.staffInvite.update({
          where: { id: open.id },
          data: { fullName, phone, tokenHash, expiresAt, invitedById },
        })
      : await this.prisma.staffInvite.create({
          data: { email, fullName, phone, tokenHash, expiresAt, invitedById },
        });

    const portal = this.portalBase(origin);
    const inviteUrl = `${portal}/register?invite=${encodeURIComponent(token)}`;

    let emailed = false;
    let failure = 'The invitation email could not be sent.';
    try {
      await this.mail.sendStaffInvite({
        to: email,
        fullName,
        inviteUrl,
      });
      emailed = true;
    } catch (error) {
      failure = error instanceof Error ? error.message : failure;
      this.logger.error(`Staff invite email failed for ${email}: ${failure}`);
    }

    return {
      id: saved.id,
      email: saved.email,
      fullName: saved.fullName,
      phone: saved.phone,
      expiresAt: saved.expiresAt.toISOString(),
      createdAt: saved.createdAt.toISOString(),
      emailed,
      ...(emailed ? {} : { message: failure }),
    };
  }

  private portalBase(origin?: string) {
    const configured = this.config.get('PORTAL_URL')?.replace(/\/$/, '');
    if (configured) return configured;
    if (origin && /^https?:\/\/[^/\s]+$/i.test(origin)) return origin;
    return 'http://localhost:3000';
  }

  async listStaffDocuments(id: string) {
    const staff = await this.prisma.user.findFirst({
      where: { id, role: Role.STAFF },
      select: { id: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff account not found');
    }

    const documents = await this.prisma.document.findMany({
      where: { uploadedById: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        year: true,
        referenceNumber: true,
        feePkr: true,
        status: true,
        source: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        ocrStatus: true,
        reviewNote: true,
        reviewedAt: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            active: true,
          },
        },
        uploadedBy: {
          select: { id: true, email: true, fullName: true, role: true },
        },
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
      },
    });

    return documents.map((document) => ({
      ...document,
      ocrText: null,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      publishedAt: document.publishedAt?.toISOString() ?? null,
      reviewedAt: document.reviewedAt?.toISOString() ?? null,
    }));
  }

  async decide(id: string, decision: 'APPROVE' | 'REJECT' | 'BLOCK') {
    const staff = await this.prisma.user.findFirst({
      where: { id, role: Role.STAFF },
    });

    if (!staff) {
      throw new NotFoundException('Staff account not found');
    }

    const accountStatus =
      decision === 'APPROVE'
        ? AccountStatus.ACTIVE
        : decision === 'BLOCK'
          ? AccountStatus.BLOCKED
          : AccountStatus.REJECTED;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { accountStatus },
      select: staffSelect,
    });

    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}
