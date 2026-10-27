import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AccountStatus } from '@prisma/client';
import { Role } from '../common/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { assertAccountCanSignIn } from './account-access';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthUser } from './types/auth-user.type';

type AuthResponse = {
  pending: false;
  accessToken: string;
  user: AuthUser;
};

type PendingRegistration = {
  pending: true;
  message: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse | PendingRegistration> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const role = dto.role === Role.STAFF ? Role.STAFF : Role.PUBLIC;
    const accountStatus =
      role === Role.STAFF ? AccountStatus.PENDING : AccountStatus.ACTIVE;
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName.trim(),
        passwordHash,
        role,
        accountStatus,
      },
    });

    if (accountStatus === AccountStatus.PENDING) {
      return {
        pending: true,
        message:
          'Your staff account is waiting for admin approval. You can sign in after an admin approves it.',
      };
    }

    return this.buildAuthResponse(user);
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
