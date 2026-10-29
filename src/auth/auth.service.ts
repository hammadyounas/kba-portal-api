import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AccountStatus } from '@prisma/client';
import { Role } from '../common/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { assertAccountCanSignIn } from './account-access';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthUser, toAuthUser } from './types/auth-user.type';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

type AuthResponse = {
  pending: false;
  accessToken: string;
  user: AuthUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly storage: StorageService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (dto.role === Role.STAFF) {
      throw new BadRequestException(
        'Staff accounts are created from an admin invitation.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName.trim(),
        passwordHash,
        role: Role.PUBLIC,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    return this.buildAuthResponse(user);
  }

  async previewInvite(token: string) {
    const invite = await this.findOpenInvite(token);
    return {
      email: invite.email,
      fullName: invite.fullName,
      phone: invite.phone,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<AuthResponse> {
    const invite = await this.findOpenInvite(dto.token);
    const existing = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invite.email,
          fullName: invite.fullName,
          phone: invite.phone,
          passwordHash,
          role: Role.STAFF,
          accountStatus: AccountStatus.ACTIVE,
        },
      });
      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });

    return this.buildAuthResponse(user);
  }

  private async findOpenInvite(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invite = await this.prisma.staffInvite.findUnique({
      where: { tokenHash },
    });

    if (!invite || invite.acceptedAt) {
      throw new NotFoundException('This invitation is no longer available.');
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'This invitation has expired. Ask an admin to send a new one.',
      );
    }

    return invite;
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    assertAccountCanSignIn(user);
    return this.buildAuthResponse(user);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.requireUser(userId);
    assertAccountCanSignIn(user);
    return toAuthUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<AuthUser> {
    await this.requireUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName.trim(),
        ...(dto.phone !== undefined ? { phone: this.normalizePhone(dto.phone) } : {}),
      },
    });
    return toAuthUser(user);
  }

  async setAvatar(userId: string, file?: Express.Multer.File): Promise<AuthUser> {
    const existing = await this.requireUser(userId);
    if (!file) {
      throw new BadRequestException('Choose a profile photo');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Profile photo must be 2MB or smaller');
    }

    const mimeType = detectImageMime(file.buffer);
    if (!mimeType) {
      throw new BadRequestException('Use a JPEG, PNG, or WebP photo');
    }

    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const storageKey = `avatars/${userId}/${randomUUID()}.${extension}`;
    await this.storage.putObject(storageKey, file.buffer, mimeType);

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          avatarKey: storageKey,
          avatarMime: mimeType,
          avatarUpdatedAt: new Date(),
        },
      });
      if (existing.avatarKey && existing.avatarKey !== storageKey) {
        await this.storage.deleteObject(existing.avatarKey).catch(() => undefined);
      }
      return toAuthUser(user);
    } catch (error) {
      await this.storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async clearAvatar(userId: string): Promise<AuthUser> {
    const existing = await this.requireUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarKey: null,
        avatarMime: null,
        avatarUpdatedAt: null,
      },
    });
    if (existing.avatarKey) {
      await this.storage.deleteObject(existing.avatarKey).catch(() => undefined);
    }
    return toAuthUser(user);
  }

  async readAvatar(userId: string) {
    const user = await this.requireUser(userId);
    if (!user.avatarKey) {
      throw new NotFoundException('No profile photo');
    }
    const buffer = await this.storage.getObject(user.avatarKey);
    return {
      buffer,
      mimeType: user.avatarMime || 'image/jpeg',
    };
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  private normalizePhone(phone: string | null | undefined) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      throw new BadRequestException('Enter a valid phone number');
    }
    return phone.trim();
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: string;
    avatarKey: string | null;
    avatarUpdatedAt: Date | null;
  }): AuthResponse {
    const authUser = toAuthUser(user);

    const accessToken = this.jwt.sign({
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role,
    });

    return { pending: false, accessToken, user: authUser };
  }
}

function detectImageMime(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
