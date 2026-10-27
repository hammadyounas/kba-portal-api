import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined || value === null
      ? undefined
      : Number(value),
  )
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined || value === null
      ? 0
      : Number(value),
  )
  @IsInt()
  @Min(0)
  feePkr?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  /** draft | pending — default draft */
  @IsOptional()
  @IsString()
  status?: 'DRAFT' | 'PENDING';

  /** web_upload | mobile_scan — default web_upload */
  @IsOptional()
  @IsString()
  source?: 'WEB_UPLOAD' | 'MOBILE_SCAN';
}
