import { Role } from '../../common/enums/role.enum';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};
