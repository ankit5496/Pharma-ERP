// Must be the first import: NestJS's DI reads the decorator metadata this shim
// installs, and anything imported before it would be missing that metadata.
import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/env.validation';
import { VALIDATION_PIPE_OPTIONS } from './config/validation-pipe.options';

async function bootstrap(): Promise<void> {
  // NOT bufferLogs: true. Buffering holds every log until the application
  // finishes initialising, so a crash during init — a database that will not
  // connect, a failing onModuleInit — discards the buffer and the process dies
  // with no output at all. That is the single worst thing a deploy log can do.
  // Buffering only pays off when a custom logger is attached later, which this
  // app does not do.
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const port = config.get('API_PORT', { infer: true });
  const nodeEnv = config.get('NODE_ENV', { infer: true });

  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));

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

  // Bind 0.0.0.0 explicitly rather than relying on the default. A container
  // platform routes traffic to the container's own address, so a server bound
  // only to loopback is unreachable and the host reports "no open ports
  // detected" without any error from the process itself.
  await app.listen(port, '0.0.0.0');

  logger.log(`API listening on port ${port} (${nodeEnv})`);
  logger.log(`Health check: /health`);
}

void bootstrap().catch((error: unknown) => {
  // Env validation and the initial database connection both throw here. Exit
  // non-zero and loudly: a process that starts up misconfigured is worse than
  // one that refuses to start.
  // eslint-disable-next-line no-console -- the Nest logger may not exist yet
  console.error('Failed to start API:', error);

  // NOT process.exit(1): that terminates immediately and can truncate the write
  // above before stdout flushes, which on a hosted platform shows up as a
  // process that died with no explanation. Setting exitCode lets the runtime
  // drain its streams and exit on its own; the unref'd timer is the backstop
  // for a handle that would otherwise keep the process alive forever.
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 3_000).unref();
});
