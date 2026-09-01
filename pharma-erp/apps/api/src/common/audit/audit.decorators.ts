import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_KEY = 'audit:entity';
export const AUDIT_SKIP_KEY = 'audit:skip';

/**
 * Names the entity a controller (or a single handler) mutates, so the audit
 * interceptor can label its rows.
 *
 * Auditing itself is NOT opted into by this decorator — every mutating request
 * is audited by default. This only supplies the entity type; without it the
 * interceptor infers one from the controller's route prefix, which is usually
 * right but not always.
 *
 * @example
 * ```ts
 * @Auditable('Batch')
 * @Controller('batches')
 * export class BatchController {}
 * ```
 */
export const Auditable = (entityType: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIT_ENTITY_KEY, entityType);

/**
 * Excludes a handler or controller from the audit trail.
 *
 * Use sparingly and say why: the audit trail is a compliance artefact, and a
 * gap in it is a finding during an inspection. Legitimate uses are endpoints
 * that mutate nothing durable — auth callbacks, file-upload pre-signing,
 * idempotent cache warmers.
 *
 * @param reason recorded in the code (and surfaced in the startup audit report)
 *   so a reviewer can judge the exclusion without reading the handler.
 */
export const SkipAudit = (reason: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIT_SKIP_KEY, reason);
