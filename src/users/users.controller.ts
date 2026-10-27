import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StaffDecisionDto } from './dto/staff-decision.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('staff')
  listStaff() {
    return this.users.listStaff();
  }

  @Post('staff/:id/decision')
  decide(@Param('id') id: string, @Body() dto: StaffDecisionDto) {
    return this.users.decide(id, dto.decision);
  }
}
