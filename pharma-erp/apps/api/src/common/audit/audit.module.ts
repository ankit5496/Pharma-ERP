import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { AuditService } from './audit.service';

/**
 * Global so that any service can inject AuditService to record a change with
 * full before/after snapshots, which the request-level interceptor cannot see.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
