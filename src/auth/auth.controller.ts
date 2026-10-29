import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthService } from './auth.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthUser } from './types/auth-user.type';

const avatarUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('invites/:token')
  previewInvite(@Param('token') token: string) {
    return this.authService.previewInvite(token);
  }

  @Post('accept-invite')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(avatarUpload)
  uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    return this.authService.setAvatar(user.id, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.authService.clearAvatar(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/avatar')
  async avatar(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const file = await this.authService.readAvatar(user.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  }

  /** Smoke-test endpoints for Step 1 role guards */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin-only')
  adminOnly(@CurrentUser() user: AuthUser) {
    return { message: 'Admin access granted', user };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @Get('staff-area')
  staffArea(@CurrentUser() user: AuthUser) {
    return { message: 'Staff/Admin access granted', user };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PUBLIC, Role.STAFF, Role.ADMIN)
  @Get('member-area')
  memberArea(@CurrentUser() user: AuthUser) {
    return { message: 'Authenticated member access granted', user };
  }
}
