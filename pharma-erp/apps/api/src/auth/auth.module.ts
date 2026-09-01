import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthController } from './auth.controller';
import { ClerkService } from './clerk.service';
import { OnboardingService } from './onboarding.service';

/**
 * Global because ClerkAuthGuard and RolesGuard are registered app-wide in
 * AppModule and Nest resolves a global guard's dependencies from the root
 * injector.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [ClerkService, OnboardingService],
  exports: [ClerkService, OnboardingService],
})
export class AuthModule {}
