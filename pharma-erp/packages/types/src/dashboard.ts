import type { UserRole } from './roles';

/**
 * Role-aware dashboard contract.
 *
 * The API decides what a caller may see and returns only that — the web app
 * renders whatever arrives rather than fetching everything and hiding some of
 * it. That ordering matters: a dashboard that filters client-side has already
 * sent the data.
 */

/**
 * What a widget is showing, and whether it can show anything yet.
 *
 * `pending` exists because most operational widgets need tables that do not
 * exist yet (Item, Batch, PurchaseOrder…). Rendering an honest "not built yet"
 * card beats inventing a number — a fabricated figure in a pharma system is
 * worse than an obvious gap, because someone will eventually act on it.
 */
export type WidgetState = 'ready' | 'pending';

export interface StatWidget {
  key: string;
  label: string;
  state: WidgetState;
  /** Null when `state` is 'pending'. */
  value: number | null;
  /** Optional qualifier, e.g. "3 awaiting first sign-in". */
  detail?: string;
  /** Which module this belongs to, so the UI can group and link. */
  module: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Full name of whoever acted, or null for system/CLI actions. */
  actor: string | null;
  at: string;
}

/**
 * The dashboard for the signed-in tenant user.
 *
 * `sections` are ordered as the API intends them to appear; the client does not
 * re-sort. `role` and `company` are echoed so the page can label who is looking
 * without a second request.
 */
export interface TenantDashboard {
  role: UserRole;
  roleLabel: string;
  company: {
    name: string;
    slug: string;
    status: string;
    drugLicenceNumber: string | null;
    timezone: string;
  };
  /** Headline for this role, e.g. "Company overview" vs "Your work". */
  headline: string;
  sections: DashboardSection[];
  /** Modules this role may open, for the "your access" panel. */
  accessibleModules: readonly string[];
  /** True for MANAGEMENT: everything visible, nothing writable. */
  readOnly: boolean;
  recentActivity: ActivityItem[];
  /** Present only for roles allowed to see it (ADMIN, MANAGEMENT). */
  companyStats?: CompanyStats;
}

export interface DashboardSection {
  key: string;
  title: string;
  /** Shown under the title when the section is mostly unbuilt. */
  note?: string;
  widgets: StatWidget[];
}

/** Company-level figures. Withheld from roles with no reason to see them. */
export interface CompanyStats {
  users: {
    total: number;
    active: number;
    pendingPasswordChange: number;
    disabled: number;
    byRole: { role: UserRole; label: string; count: number }[];
  };
  auditRecordCount: number;
  createdAt: string;
}
