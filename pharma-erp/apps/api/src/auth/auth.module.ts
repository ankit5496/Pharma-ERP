import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Global because JwtAuthGuard and RolesGuard are registered app-wide in
 * AppModule, and Nest resolves a global guard's dependencies from the root
 * injector.
 *
 * JwtModule is registered without a secret: TokenService passes the secret per
 * call from validated config instead. That keeps one source of truth for the
 * value and avoids a module-level async factory just to read it.
 */
@Global()
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [AuthService, PasswordService, TokenService],
})
export class AuthModule {}
