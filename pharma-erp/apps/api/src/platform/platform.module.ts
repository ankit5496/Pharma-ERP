import { Module } from '@nestjs/common';

import { PlatformAuthService } from './platform-auth.service';
import { PlatformDbService } from './platform-db.service';
import { PlatformController } from './platform.controller';
import { PlatformGuard } from './platform.guard';
import { PlatformService } from './platform.service';

/**
 * The platform layer.
 *
 * PlatformGuard is provided here and applied per-controller with @UseGuards,
 * NOT registered globally: the global tenant guard and this one must not both
 * run on the same route, since a platform operator is not in `users` and a
 * tenant user is not in `platform_users`.
 *
 * AuthModule is @Global, so PasswordService and TokenService resolve without an
 * import — the same argon2 parameters and signing key serve both surfaces, which
 * is deliberate: two password implementations would eventually diverge.
 */
@Module({
  controllers: [PlatformController],
  providers: [PlatformDbService, PlatformAuthService, PlatformService, PlatformGuard],
  exports: [PlatformDbService],
})
export class PlatformModule {}
