'use client';

import { useActionState } from 'react';
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT } from '@pharma-erp/types';

import { platformChangePasswordAction, type PlatformPasswordState } from '../actions';

const INITIAL: PlatformPasswordState = { status: 'idle' };

export function PlatformChangePasswordForm() {
  const [state, formAction, isSubmitting] = useActionState(platformChangePasswordAction, INITIAL);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === 'error' && state.message && (
        <div
          role="alert"
          className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200"
        >
          {state.message}
        </div>
      )}

      <Field
        id="currentPassword"
        label="Current password"
        autoComplete="current-password"
        autoFocus
      />
      <Field
        id="newPassword"
        label="New password"
        hint={PASSWORD_RULE_TEXT}
        autoComplete="new-password"
      />
      <Field id="confirmPassword" label="Confirm new password" autoComplete="new-password" />

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isSubmitting ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  autoComplete,
  autoFocus = false,
}: {
  id: string;
  label: string;
  hint?: string;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="field-label-dark">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        required
        minLength={id === 'currentPassword' ? undefined : PASSWORD_MIN_LENGTH}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-describedby={hintId}
        className="field-dark mt-1.5"
      />
      {hint && (
        <p id={hintId} className="field-hint-dark">
          {hint}
        </p>
      )}
    </div>
  );
}
