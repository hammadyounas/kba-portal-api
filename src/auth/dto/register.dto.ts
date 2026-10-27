import { IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsIn([Role.PUBLIC, Role.STAFF])
  role?: Role.PUBLIC | Role.STAFF;
}
