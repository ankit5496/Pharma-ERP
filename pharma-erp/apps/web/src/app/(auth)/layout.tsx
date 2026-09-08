import type { ReactNode } from 'react';

/**
 * Shell for the unauthenticated pages (sign-in, sign-up).
 *
 * A route group — the `(auth)` folder does not appear in the URL — so these
 * pages keep their clean `/sign-in` and `/sign-up` paths while sharing a layout
 * that the signed-in application shell never has to know about.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      {/* Context panel. Hidden on small screens, where the form is all that
          matters and vertical space is scarce. */}
      <aside className="hidden bg-slate-900 px-12 py-16 text-slate-100 lg:flex lg:w-[44%] lg:flex-col lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Pharma ERP
          </p>
          {/* Styled like a heading but not one: the page itself owns the h1
              ("Sign in" / "Create your account"), and a second h1 in this panel
              would leave every auth page with two competing top-level headings. */}
          <p className="mt-6 max-w-sm text-3xl font-semibold leading-tight tracking-tight">
            Manufacturing, quality and compliance in one system of record.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            Batch genealogy, formulation control and a complete, append-only audit trail — built for
            pharmaceutical manufacturers.
          </p>
        </div>

        <dl className="mt-12 space-y-5 border-t border-slate-800 pt-8">
          <Highlight
            term="Role-based access"
            detail="Eight roles from Purchase to Quality to read-only Management, enforced at the API."
          />
          <Highlight
            term="Tenant isolation"
            detail="Every company's data is separated at the database level by row-level security."
          />
          <Highlight
            term="Traceable by default"
            detail="Every change is recorded automatically, and audit records can never be altered."
          />
        </dl>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}

function Highlight({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-100">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-slate-400">{detail}</dd>
    </div>
  );
}
