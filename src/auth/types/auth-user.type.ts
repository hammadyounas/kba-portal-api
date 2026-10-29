import { Role } from '../../common/enums/role.enum';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  hasAvatar: boolean;
  avatarUpdatedAt: string | null;
};

export function toAuthUser(user: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  avatarKey: string | null;
  avatarUpdatedAt: Date | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role as Role,
    hasAvatar: Boolean(user.avatarKey),
    avatarUpdatedAt: user.avatarUpdatedAt?.toISOString() ?? null,
  };
}
