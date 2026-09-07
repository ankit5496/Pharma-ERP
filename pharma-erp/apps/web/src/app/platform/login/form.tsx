'use client';

import { useActionState } from 'react';

import { platformLoginAction, type PlatformLoginState } from '../actions';

const INITIAL: PlatformLoginState = { status: 'idle' };

export function PlatformLoginForm() {
  const [state, formAction, isSubmitting] = useActionState(platformLoginAction, INITIAL);

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

      <div>
        <label htmlFor="email" className="field-label-dark">
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
          className="field-dark mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="password" className="field-label-dark">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field-dark mt-1.5"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in to console'}
      </button>
    </form>
  );
}
