/**
 * The eight application roles. This is the single source of truth shared by the
 * API's guards and the web app's navigation; the Prisma `UserRole` enum in
 * packages/database mirrors these values exactly, and a compile-time assertion
 * in packages/database/src/index.ts fails the build if the two ever drift.
 */
export const USER_ROLES = [
  'ADMIN',
  'PURCHASE_MANAGER',
  'STORE_OFFICER',
  'PRODUCTION_OFFICER',
  'QUALITY_OFFICER',
  'SALES_MANAGER',
  'ACCOUNTANT',
  'MANAGEMENT',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Human-readable labels for UI. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  PURCHASE_MANAGER: 'Purchase Manager',
  STORE_OFFICER: 'Store / Inventory Officer',
  PRODUCTION_OFFICER: 'Production Officer',
  QUALITY_OFFICER: 'Quality / Compliance Officer',
  SALES_MANAGER: 'Sales Manager',
  ACCOUNTANT: 'Accountant',
  MANAGEMENT: 'Management (read-only)',
};

/**
 * Roles that must never be granted write access to any resource. Enforced by
 * the API's role guard once auth is wired up, and asserted here so the
 * read-only nature of MANAGEMENT is a declared property rather than a
 * convention scattered across controllers.
 */
export const READ_ONLY_ROLES: readonly UserRole[] = ['MANAGEMENT'];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
