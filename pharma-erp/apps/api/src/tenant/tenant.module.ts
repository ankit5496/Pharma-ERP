import { Global, Module } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service';

/**
 * Global because the tenant context underpins both database access and audit
 * logging; there is no module in this application that is legitimately unaware
 * of which tenant it is serving.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
