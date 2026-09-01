'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { checkSlugAction, createCompanyAction, type CreateCompanyState } from './actions';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'UTC',
] as const;

const INITIAL: CreateCompanyState = { status: 'idle' };

/** Mirrors slugifyCompanyName in packages/database, for the live suggestion. */
function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '');
}

type SlugState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export function CompanyForm({ defaultFullName }: { defaultFullName: string }) {
  const router = useRouter();
  const [state, formAction, isSubmitting] = useActionState(createCompanyAction, INITIAL);

  const [companyName, setCompanyName] = useState(state.values?.companyName ?? '');
  // Tracked separately from companyName so a manual edit is not overwritten by
  // the next keystroke in the name field.
  const [slug, setSlug] = useState(state.values?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [, startTransition] = useTransition();

  const effectiveSlug = slugEdited ? slug : slugify(companyName);

  // Debounced availability check. 400ms is long enough that typing a name does
  // not fire a request per character, short enough to feel immediate.
  useEffect(() => {
    if (effectiveSlug.length < 3) {
      setSlugState(effectiveSlug.length === 0 ? 'idle' : 'invalid');
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effectiveSlug)) {
      setSlugState('invalid');
      return;
    }

    setSlugState('checking');
    let cancelled = false;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const available = await checkSlugAction(effectiveSlug);
        // Guard against a slow response for a slug the user has since changed.
        if (!cancelled) setSlugState(available ? 'available' : 'taken');
      });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveSlug]);

  // On success the session now has a tenant, so the dashboard is reachable.
  useEffect(() => {
    if (state.status === 'success') router.replace('/dashboard');
  }, [state.status, router]);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.status === 'error' && state.message && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-medium">Could not create your company.</p>
          <p className="mt-1">{state.message}</p>
        </div>
      )}

      <Field
        label="Company name"
        name="companyName"
        required
        hint="As registered with your drug licensing authority."
        value={companyName}
        onChange={setCompanyName}
        autoComplete="organization"
        maxLength={255}
      />

      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-slate-700">
          Company identifier <span className="text-red-600">*</span>
        </label>
        <div className="mt-1.5 flex rounded-md shadow-sm">
          <span className="inline-flex select-none items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
            /
          </span>
          <input
            id="slug"
            name="slug"
            required
            value={effectiveSlug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value.toLowerCase());
            }}
            className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-slate-300 font-mono text-sm text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            maxLength={63}
            aria-describedby="slug-hint"
            spellCheck={false}
          />
        </div>
        <p id="slug-hint" className="mt-1.5 text-xs">
          <SlugFeedback state={slugState} slug={effectiveSlug} />
        </p>
      </div>

      <Field
        label="Your full name"
        name="fullName"
        required
        hint="You will be this company's administrator."
        defaultValue={state.values?.fullName ?? defaultFullName}
        autoComplete="name"
        maxLength={255}
      />

      <fieldset className="space-y-6 border-t border-slate-200 pt-6">
        <legend className="sr-only">Regulatory details</legend>
        <p className="text-xs text-slate-500">
          Optional now — a manufacturing licence number is required before a batch can be released.
        </p>

        <Field
          label="Manufacturing licence number"
          name="drugLicenceNumber"
          hint="Issued by your state FDA or drug controller."
          defaultValue={state.values?.drugLicenceNumber ?? ''}
          maxLength={64}
          className="font-mono"
        />

        <Field
          label="GSTIN"
          name="gstin"
          hint="15-character GST registration number."
          defaultValue={state.values?.gstin ?? ''}
          maxLength={15}
          className="font-mono uppercase"
        />

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-slate-700">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={state.values?.timezone ?? 'Asia/Kolkata'}
            className="mt-1.5 block w-full rounded-md border-slate-300 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          >
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            Manufacturing and expiry dates are shown in this zone. It is legally meaningful, so
            choose the site&rsquo;s own timezone.
          </p>
        </div>
      </fieldset>

      <button
        type="submit"
        // Blocked on 'taken'/'invalid' only. 'checking' still submits: the API
        // re-validates anyway, and disabling the button on every keystroke makes
        // the form feel broken.
        disabled={isSubmitting || slugState === 'taken' || slugState === 'invalid'}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSubmitting ? 'Creating your company…' : 'Create company'}
      </button>

      <p className="text-center text-xs text-slate-500">
        You&rsquo;ll be able to invite your team and assign their roles straight afterwards.
      </p>
    </form>
  );
}

function SlugFeedback({ state, slug }: { state: SlugState; slug: string }) {
  switch (state) {
    case 'checking':
      return <span className="text-slate-500">Checking availability…</span>;
    case 'available':
      return <span className="text-status-ok">“{slug}” is available.</span>;
    case 'taken':
      return <span className="text-status-error">“{slug}” is already taken or reserved.</span>;
    case 'invalid':
      return (
        <span className="text-status-error">
          Use at least 3 lowercase letters, digits or single hyphens.
        </span>
      );
    default:
      return (
        <span className="text-slate-500">
          Lowercase letters, digits and hyphens. Used in URLs; cannot be changed later.
        </span>
      );
  }
}

interface FieldProps {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  autoComplete?: string;
  className?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

function Field({
  label,
  name,
  hint,
  required = false,
  maxLength,
  autoComplete,
  className = '',
  value,
  defaultValue,
  onChange,
}: FieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-describedby={hintId}
        {...(onChange
          ? { value: value ?? '', onChange: (event) => onChange(event.target.value) }
          : { defaultValue })}
        className={`mt-1.5 block w-full rounded-md border-slate-300 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 ${className}`}
      />
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}
