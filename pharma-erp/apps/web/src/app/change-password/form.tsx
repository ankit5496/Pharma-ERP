'use client';

import { useActionState } from 'react';
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT } from '@pharma-erp/types';

import { changePasswordAction, type ChangePasswordState } from './actions';

const INITIAL: ChangePasswordState = { status: 'idle' };

export function ChangePasswordForm() {
  const [state, formAction, isSubmitting] = useActionState(changePasswordAction, INITIAL);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === 'error' && state.message && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.message}
        </div>
      )}

      <Field
        id="currentPassword"
        label="Current password"
        hint="The one your administrator gave you."
        autoComplete="current-password"
        autoFocus
      />

      <Field
        id="newPassword"
        label="New password"
        hint={PASSWORD_RULE_TEXT}
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
      />

      <Field
        id="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
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
  minLength,
}: {
  id: string;
  label: string;
  hint?: string;
  autoComplete: string;
  autoFocus?: boolean;
  minLength?: number;
}) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        required
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        minLength={minLength}
        aria-describedby={hintId}
        className="field mt-1.5"
      />
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
