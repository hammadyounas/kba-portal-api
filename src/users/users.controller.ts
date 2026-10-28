import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../auth/types/auth-user.type';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { StaffDecisionDto } from './dto/staff-decision.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('staff/invites')
  listInvites() {
    return this.users.listInvites();
  }

  @Post('staff/invites')
  invite(
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteStaffDto,
    @Headers('origin') origin?: string,
  ) {
    return this.users.invite(user.id, dto, origin);
  }

  @Get('staff')
  listStaff() {
    return this.users.listStaff();
  }

  @Get('staff/:id/documents')
  listStaffDocuments(@Param('id') id: string) {
    return this.users.listStaffDocuments(id);
  }

  @Post('staff/:id/decision')
  decide(@Param('id') id: string, @Body() dto: StaffDecisionDto) {
    return this.users.decide(id, dto.decision);
  }
}
