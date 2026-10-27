import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === '' || value === null) return null;
    return Number(value);
  })
  @IsInt()
  @Min(1900)
  year?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined || value === null
      ? undefined
      : Number(value),
  )
  @IsInt()
  @Min(0)
  feePkr?: number;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING'])
  status?: 'DRAFT' | 'PENDING';
}
