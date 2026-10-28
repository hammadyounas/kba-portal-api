import { UnauthorizedException } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';

export function assertAccountCanSignIn(user: {
  role: string;
  accountStatus: AccountStatus;
}) {
  if (user.accountStatus === AccountStatus.ACTIVE) {
    return;
  }

  if (user.role === 'STAFF' && user.accountStatus === AccountStatus.PENDING) {
    throw new UnauthorizedException(
      'Your staff account is waiting for admin approval.',
    );
  }

  if (user.role === 'STAFF' && user.accountStatus === AccountStatus.REJECTED) {
    throw new UnauthorizedException('Your staff account was not approved.');
  }

  if (user.role === 'STAFF' && user.accountStatus === AccountStatus.BLOCKED) {
    throw new UnauthorizedException('Your staff account has been blocked.');
  }

  throw new UnauthorizedException('This account is not active.');
}
