import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const REVIEW_DECISIONS = [
  'PUBLISH',
  'REQUEST_EDITS',
  'REJECT',
  'UNPUBLISH',
] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export class ReviewDocumentDto {
  @IsIn(REVIEW_DECISIONS)
  decision!: ReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
