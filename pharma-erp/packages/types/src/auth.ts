import type { UserRole } from './roles';

/**
 * The authenticated user as the web app sees them, returned by `GET /api/v1/me`.
 *
 * Note what is NOT here: no token, no Clerk id, no password material. The web
 * app never needs the Clerk subject, and putting it in a response body would
 * only invite it into logs.
 */
export interface SessionUser {
  /** Our own User.id (UUID), not the Clerk user id. */
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  /** INVITED users have signed in but not yet been activated by an Admin. */
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
}

/**
 * Response of `GET /api/v1/me`.
 *
 * The `onboarded: false` case is the crux of the signup flow: a Clerk session
 * can exist before any Tenant does (the user has just registered and has not
 * created their company yet). Modelling that as a valid response rather than a
 * 401 lets the web app route them to /onboarding instead of bouncing them back
 * to sign-in in a loop.
 */
export type SessionResponse =
  { onboarded: true; user: SessionUser } | { onboarded: false; reason: 'NO_TENANT' | 'DISABLED' };

/** Request body of `POST /api/v1/onboarding/company`. */
export interface CreateCompanyRequest {
  /** Registered name of the manufacturing company. */
  companyName: string;
  /** URL-safe tenant identifier; unique across the platform. */
  slug: string;
  /** Full name of the person signing up — they become the tenant's Admin. */
  fullName: string;
  /** Manufacturing licence number; optional at signup, required before batch release. */
  drugLicenceNumber?: string;
  gstin?: string;
  /** IANA timezone, e.g. "Asia/Kolkata". */
  timezone?: string;
}

export interface CreateCompanyResponse {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  /** Always ADMIN — the first user of a tenant provisions it and owns it. */
  role: Extract<UserRole, 'ADMIN'>;
}

/**
 * Feature areas of the application. Used to decide what a role may see; the
 * authoritative write-side check is the API's role guard, this drives navigation.
 */
export const APP_MODULES = [
  'dashboard',
  'masters',
  'purchase',
  'inventory',
  'production',
  'quality',
  'sales',
  'accounts',
  'admin',
] as const;

export type AppModule = (typeof APP_MODULES)[number];

/**
 * Which modules each role can open. MANAGEMENT sees everything but writes
 * nothing — see READ_ONLY_ROLES in ./roles.
 *
 * This is deliberately data rather than a pile of conditionals: the API guard
 * and the web navigation read the same table, so a role cannot end up with a
 * menu item it is not allowed to use.
 */
export const ROLE_MODULES: Record<UserRole, readonly AppModule[]> = {
  ADMIN: [...APP_MODULES],
  MANAGEMENT: [...APP_MODULES],
  PURCHASE_MANAGER: ['dashboard', 'masters', 'purchase'],
  STORE_OFFICER: ['dashboard', 'masters', 'inventory'],
  PRODUCTION_OFFICER: ['dashboard', 'production', 'inventory'],
  QUALITY_OFFICER: ['dashboard', 'quality', 'production'],
  SALES_MANAGER: ['dashboard', 'masters', 'sales'],
  ACCOUNTANT: ['dashboard', 'accounts', 'purchase', 'sales'],
};

/** Where a role lands after signing in. */
export const ROLE_LANDING_PATH: Record<UserRole, string> = {
  ADMIN: '/dashboard',
  MANAGEMENT: '/dashboard',
  PURCHASE_MANAGER: '/dashboard',
  STORE_OFFICER: '/dashboard',
  PRODUCTION_OFFICER: '/dashboard',
  QUALITY_OFFICER: '/dashboard',
  SALES_MANAGER: '/dashboard',
  ACCOUNTANT: '/dashboard',
};

export function canAccessModule(role: UserRole, appModule: AppModule): boolean {
  return ROLE_MODULES[role].includes(appModule);
}

/** Auth-related route paths, shared so the web middleware and API agree. */
export const AUTH_ROUTES = {
  signIn: '/sign-in',
  signUp: '/sign-up',
  onboarding: '/onboarding',
  afterSignOut: '/sign-in',
} as const;
