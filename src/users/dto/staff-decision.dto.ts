import { IsIn } from 'class-validator';

export class StaffDecisionDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';
}
