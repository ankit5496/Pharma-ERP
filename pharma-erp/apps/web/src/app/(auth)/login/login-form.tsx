'use client';

import { useActionState } from 'react';

import { loginAction, type LoginState } from './actions';

const INITIAL: LoginState = { status: 'idle' };

export function LoginForm() {
  const [state, formAction, isSubmitting] = useActionState(loginAction, INITIAL);

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

      <div>
        <label htmlFor="email" className="field-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          defaultValue={state.email ?? ''}
          className="field mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          // "current-password" lets a password manager offer the saved entry.
          // Never cleared on error: retyping a long passphrase because the
          // server said no is needless friction.
          autoComplete="current-password"
          className="field mt-1.5"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
