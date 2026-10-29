import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PAYMENT_METHODS = ['JAZZCASH'] as const;
export type PaymentMethodName = (typeof PAYMENT_METHODS)[number];

export class CheckoutDto {
  @IsString()
  documentId!: string;

  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodName;

  @IsOptional()
  @IsString()
  @MaxLength(23)
  cardNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cardName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  expiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  cvc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  mobile?: string;
}
