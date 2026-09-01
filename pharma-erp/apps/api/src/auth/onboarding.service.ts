import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  createProvisioningClient,
  Prisma,
  RESERVED_TENANT_SLUGS,
  type PrismaClient,
} from '@pharma-erp/database';
import { PG_TENANT_SETTING, type CreateCompanyResponse } from '@pharma-erp/types';

import { AuditService } from '../common/audit/audit.service';
import type { EnvironmentVariables } from '../config/env.validation';
import { TenantContextService } from '../tenant/tenant-context.service';

import { ClerkService } from './clerk.service';
import type { CreateCompanyDto } from './dto/create-company.dto';

@Injectable()
export class OnboardingService implements OnModuleDestroy {
  private readonly logger = new Logger(OnboardingService.name);

  /**
   * Elevated connection, used for nothing but this file.
   *
   * `tenants` has no INSERT policy for the application role — on purpose, so no
   * request-scoped code can invent a tenant. Company signup is the single
   * legitimate exception, so it runs on the migration connection, which owns the
   * tables and is therefore exempt from `tenants`' policies (that table is
   * ENABLE but not FORCE — see migration 20260901000300). Keeping this client
   * private to this service is what stops the exception spreading.
   *
   * It is NOT a blanket RLS bypass: `users` and `audit_logs` remain FORCE'd, so
   * even this connection is tenant-isolated on those.
   */
  private readonly provisioning: PrismaClient;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly clerk: ClerkService,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {
    this.provisioning = createProvisioningClient(
      config.get('MIGRATION_DATABASE_URL', { infer: true }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.provisioning.$disconnect();
  }

  /**
   * Creates a tenant and its first user, who is always its Admin.
   *
   * Both rows are written in one transaction: a tenant with no Admin is
   * unreachable — nobody can sign in to it and nobody can invite anyone — so a
   * half-completed signup must not be able to persist.
   */
  async createCompany(clerkUserId: string, dto: CreateCompanyDto): Promise<CreateCompanyResponse> {
    if (RESERVED_TENANT_SLUGS.includes(dto.slug)) {
      throw new ConflictException(
        `The identifier "${dto.slug}" is reserved. Please choose another.`,
      );
    }

    // A second company from the same Clerk account is prevented by the unique
    // index on users.external_auth_id and handled as P2002 below — deliberately
    // NOT by a read-then-write check here. Two reasons: a pre-check races a
    // double-submitted form (both reads miss, both writes proceed), and
    // `users` keeps FORCE ROW LEVEL SECURITY, so this connection cannot read
    // across tenants to perform the check anyway. The constraint is the only
    // thing that can actually enforce it.

    // The email comes from Clerk, never from the request body: a caller who
    // could name their own email could claim an address they do not control,
    // which matters because email is the identity an Admin later invites against.
    const profile = await this.clerk.getUserProfile(clerkUserId);

    if (!profile) {
      throw new InternalServerErrorException(
        'Could not read your verified email address from Clerk. Please try again.',
      );
    }

    try {
      const result = await this.provisioning.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            slug: dto.slug,
            name: dto.companyName,
            // TRIAL, not ACTIVE: activation is a commercial decision, and the
            // signup path should not be able to grant it.
            status: 'TRIAL',
            drugLicenceNumber: dto.drugLicenceNumber ?? null,
            gstin: dto.gstin ?? null,
            timezone: dto.timezone ?? 'Asia/Kolkata',
          },
          select: { id: true, slug: true, name: true },
        });

        // `users` keeps FORCE ROW LEVEL SECURITY, so this insert is subject to
        // users_tenant_isolation even on the owner connection. Setting the
        // tenant we just created lets the WITH CHECK pass on its own terms
        // rather than by exemption — and it means user rows stay tenant-isolated
        // even if the application were ever misconfigured to run as the owner.
        await tx.$executeRaw`SELECT set_config(${PG_TENANT_SETTING}, ${tenant.id}, true)`;

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            externalAuthId: clerkUserId,
            email: profile.email,
            fullName: dto.fullName,
            role: 'ADMIN',
            // ACTIVE immediately: Clerk has already verified the email, and
            // there is nobody else in this tenant who could activate them.
            status: 'ACTIVE',
            lastLoginAt: new Date(),
          },
          select: { id: true },
        });

        return { tenant, user };
      });

      // Populate the request context now, so the audit write below lands under
      // the new tenant. Until this point the request had no tenant at all.
      const store = this.tenantContext.get();
      if (store) {
        store.tenantId = result.tenant.id;
        store.userId = result.user.id;
        store.role = 'ADMIN';
      }

      await this.auditService.record({
        entityType: 'Tenant',
        entityId: result.tenant.id,
        action: 'CREATE',
        after: {
          slug: result.tenant.slug,
          name: result.tenant.name,
          status: 'TRIAL',
          firstAdminUserId: result.user.id,
        },
      });

      // Cosmetic mirror for the browser's first paint; failures are logged, not
      // thrown, because the tenant already exists and rolling it back over a
      // metadata write would be far worse.
      await this.clerk.syncUserMetadata(clerkUserId, {
        tenantId: result.tenant.id,
        tenantSlug: result.tenant.slug,
        role: 'ADMIN',
        userId: result.user.id,
      });

      this.logger.log(
        `Provisioned tenant ${result.tenant.slug} (${result.tenant.id}) with admin ${result.user.id}`,
      );

      return {
        tenantId: result.tenant.id,
        tenantSlug: result.tenant.slug,
        userId: result.user.id,
        role: 'ADMIN',
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Unique violation. Which constraint decides the message: slug is the
        // user's choice and fixable, the others indicate a duplicate submit.
        const target = Array.isArray(error.meta?.target)
          ? (error.meta.target as string[]).join(',')
          : String(error.meta?.target ?? '');

        if (target.includes('slug')) {
          throw new ConflictException(
            `The identifier "${dto.slug}" is already taken. Please choose another.`,
          );
        }

        throw new ConflictException('This account has already been registered.');
      }

      throw error;
    }
  }

  /** True when the slug is free and not reserved — powers the signup form's check. */
  async isSlugAvailable(slug: string): Promise<boolean> {
    if (RESERVED_TENANT_SLUGS.includes(slug)) return false;

    const existing = await this.provisioning.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    return existing === null;
  }
}
