import { Global, Module } from '@nestjs/common';

import { TenantModule } from '../tenant/tenant.module';

import { PrismaService } from './prisma.service';

/**
 * Global: essentially every feature module needs database access, and repeating
 * the import in each of them adds noise without adding safety — the safety here
 * comes from PrismaService exposing only tenant-scoped clients by default.
 */
@Global()
@Module({
  imports: [TenantModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
