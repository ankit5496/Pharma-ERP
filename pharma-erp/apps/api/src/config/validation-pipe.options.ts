import type { ValidationPipeOptions } from '@nestjs/common';

/**
 * Options for the global ValidationPipe.
 *
 * Extracted from main.ts so they can be asserted in a test. main.ts calls
 * bootstrap() at module scope, so importing it to read these would start the
 * application.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  // Strip properties with no matching DTO decorator...
  whitelist: true,
  // ...and reject outright when the client sent unknown ones, rather than
  // silently dropping them. A typo'd field name is a bug worth surfacing.
  forbidNonWhitelisted: true,
  // Turn plain JSON into DTO instances so @Type/@Transform run and path/query
  // params arrive as numbers and dates, not strings.
  transform: true,
  transformOptions: { enableImplicitConversion: false },

  /**
   * Messages are kept in production, deliberately.
   *
   * This was previously `disableErrorMessages: nodeEnv === 'production'`, on the
   * reasoning that constraint metadata should not leak. The effect was that
   * every rejected form in the deployed app showed one word — "Bad Request" —
   * with no indication of what was wrong. A user who typed
   * "kamal12@gmail.com." (one trailing dot) got a sign-in page that refused
   * them and explained nothing, while the DTO's own message,
   * "Enter a valid email address", was discarded on the way out.
   *
   * The messages on these DTOs are author-written, user-facing copy, not
   * internals. The genuinely sensitive part of a validation error is the
   * submitted VALUE — a rejected password would otherwise be echoed back — and
   * `validationError` below suppresses that independently of this flag. So
   * turning messages off bought nothing and cost every error message in the
   * product.
   */
  disableErrorMessages: false,

  /**
   * Never echo the submitted value or the DTO instance. This is the setting
   * that actually protects anything: `value: false` keeps a rejected password
   * out of the response body and the logs, and `target: false` keeps the DTO
   * shape out of it.
   */
  validationError: { target: false, value: false },
};
