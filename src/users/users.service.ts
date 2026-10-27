import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const STATUS_ORDER: Record<AccountStatus, number> = {
  PENDING: 0,
  REJECTED: 1,
  ACTIVE: 2,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listStaff() {
    const staff = await this.prisma.user.findMany({
      where: { role: Role.STAFF },
      select: {
        id: true,
        email: true,
        fullName: true,
        accountStatus: true,
        createdAt: true,
      },
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

  async decide(id: string, decision: 'APPROVE' | 'REJECT') {
    const staff = await this.prisma.user.findFirst({
      where: { id, role: Role.STAFF },
    });

    if (!staff) {
      throw new NotFoundException('Staff account not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        accountStatus:
          decision === 'APPROVE' ? AccountStatus.ACTIVE : AccountStatus.REJECTED,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        accountStatus: true,
        createdAt: true,
      },
    });

    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}
