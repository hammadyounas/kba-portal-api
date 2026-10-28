import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class InviteStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @Matches(/^[0-9+\-().\s]{7,20}$/, {
    message: 'Enter a valid phone number',
  })
  phone!: string;
}
