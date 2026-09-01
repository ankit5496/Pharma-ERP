// Must be the first import: NestJS's DI reads the decorator metadata this shim
// installs, and anything imported before it would be missing that metadata.
import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const port = config.get('API_PORT', { infer: true });
  const nodeEnv = config.get('NODE_ENV', { infer: true });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties with no matching DTO decorator...
      whitelist: true,
      // ...and reject outright when the client sent unknown ones, rather than
      // silently dropping them. A typo'd field name is a bug worth surfacing.
      forbidNonWhitelisted: true,
      // Turn plain JSON into DTO instances so @Type/@Transform run and
      // path/query params arrive as numbers and dates, not strings.
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Don't leak DTO internals or constraint metadata in production responses.
      disableErrorMessages: nodeEnv === 'production',
      validationError: { target: false, value: false },
    }),
  );

  app.enableCors({
    origin: config
      .get('WEB_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
    // x-tenant-id is the development-only tenant hint; x-request-id lets the web
    // app correlate a browser action with the API's logs and audit rows.
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });

  // Versioned from day one: retrofitting a prefix once clients exist is painful.
  // /health is excluded so orchestrators and probes have a stable, unversioned
  // URL that never moves.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/live', 'health/ready'] });

  // Run onModuleDestroy / onApplicationShutdown on SIGTERM, so Prisma closes
  // its pool instead of leaving connections for Postgres to time out.
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`API listening on http://localhost:${port} (${nodeEnv})`);
  logger.log(`Health check: http://localhost:${port}/health`);
}

void bootstrap().catch((error: unknown) => {
  // Env validation and the initial database connection both throw here. Exit
  // non-zero and loudly: a process that starts up misconfigured is worse than
  // one that refuses to start.
  // eslint-disable-next-line no-console -- the Nest logger may not exist yet
  console.error('Failed to start API:', error);
  process.exit(1);
});
