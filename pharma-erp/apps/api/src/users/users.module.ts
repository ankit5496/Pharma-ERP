import { Module } from '@nestjs/common';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * PrismaModule, AuthModule and AuditModule are all @Global, so nothing needs
 * importing here — PasswordService and AuditService resolve from the root.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
