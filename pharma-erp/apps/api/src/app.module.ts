import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { AuditModule } from './common/audit/audit.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RequestContextMiddleware } from './tenant/request-context.middleware';
import { TenantModule } from './tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // One env file for the whole monorepo, at the repo root. `validate` runs
      // before any provider is constructed, so a missing variable stops the
      // boot instead of surfacing as a runtime failure later.
      envFilePath: ['../../.env.local', '../../.env'],
      validate: validateEnv,
    }),
    TenantModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    {
      // Authentication is the default. A new controller is protected the moment
      // it is written; exposing one requires an explicit @Public('reason').
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
    {
      // Registered after ClerkAuthGuard so the request context already carries a
      // resolved role by the time this runs — Nest executes global guards in
      // registration order.
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      // Auditing is the default too: every mutating request is recorded unless
      // the handler carries @SkipAudit('reason'). Opt-out, never opt-in.
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route, including /health: the correlation id is useful there too,
    // and the middleware makes no authentication decisions of its own.
    //
    // '{*splat}' rather than '*': NestJS 11 runs on Express 5 / path-to-regexp
    // v8, where wildcards must be named. The braces make it match zero-or-more
    // segments, so '/' is covered too.
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
