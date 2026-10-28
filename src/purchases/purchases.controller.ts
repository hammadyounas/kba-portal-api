import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../auth/types/auth-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PUBLIC, Role.STAFF, Role.ADMIN)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.purchases.listMine(user);
  }

  @Get('access/:documentId')
  access(@CurrentUser() user: AuthUser, @Param('documentId') documentId: string) {
    return this.purchases.access(user, documentId);
  }

  @Get('file/:documentId')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.purchases.getAuthorizedFile(user, documentId, authorization);
    const filename = file.originalName.replace(/[\r\n"]/g, '').trim() || 'document';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  }

  @Post('checkout')
  @Roles(Role.PUBLIC)
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.purchases.checkout(user, dto);
  }
}
