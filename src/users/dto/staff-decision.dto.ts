import { IsIn } from 'class-validator';

export class StaffDecisionDto {
  @IsIn(['APPROVE', 'REJECT', 'BLOCK'])
  decision!: 'APPROVE' | 'REJECT' | 'BLOCK';
}
