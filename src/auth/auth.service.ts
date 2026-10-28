import { createHash } from 'crypto';
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
import { assertAccountCanSignIn } from './account-access';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthUser } from './types/auth-user.type';

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
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    assertAccountCanSignIn(user);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as Role,
    };
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  }): AuthResponse {
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as Role,
    };

    const accessToken = this.jwt.sign({
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role,
    });

    return { pending: false, accessToken, user: authUser };
  }
}
