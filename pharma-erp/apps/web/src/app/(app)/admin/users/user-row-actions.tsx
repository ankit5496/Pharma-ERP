'use client';

import { useState, useTransition } from 'react';
import { USER_ROLES, USER_ROLE_LABELS, type UserListItem, type UserRole } from '@pharma-erp/types';

import { deleteUserAction, resetPasswordAction, updateUserAction } from './actions';

/**
 * Per-row controls: change role, enable/disable, reset password, remove.
 *
 * Every one of these is also enforced on the API (`@Roles('ADMIN')`, plus
 * last-admin and self-modification guards). This component's job is to make the
 * outcome visible, not to be the check — a disabled button is a hint, not a
 * boundary.
 */
export function UserRowActions({ user, isSelf }: { user: UserListItem; isSelf: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? 'Something went wrong.');
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Role for ${user.fullName}`}
          value={user.role}
          // An Admin changing their own role can lock the company out of user
          // management entirely, so the API refuses it and so does this.
          disabled={isPending || isSelf}
          onChange={(event) => {
            const role = event.target.value as UserRole;
            run(() => updateUserAction(user.id, { role }));
          }}
          className="field-sm"
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {USER_ROLE_LABELS[role]}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await resetPasswordAction(user.id);
              if (result.ok && result.temporaryPassword) {
                setNewPassword(result.temporaryPassword);
              }
              return result;
            })
          }
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Reset password
        </button>

        {user.status === 'DISABLED' ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => updateUserAction(user.id, { status: 'ACTIVE' }))}
            className="rounded border border-green-300 px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-50 disabled:opacity-50"
          >
            Enable
          </button>
        ) : (
          <button
            type="button"
            disabled={isPending || isSelf}
            onClick={() => run(() => updateUserAction(user.id, { status: 'DISABLED' }))}
            className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
          >
            Disable
          </button>
        )}

        <button
          type="button"
          disabled={isPending || isSelf}
          onClick={() => {
            // A soft delete keeps the row and its audit history, but the person
            // loses access — worth one confirmation.
            if (!window.confirm(`Remove ${user.fullName}? They will lose access immediately.`)) {
              return;
            }
            run(() => deleteUserAction(user.id));
          }}
          className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
        >
          Remove
        </button>
      </div>

      {newPassword && (
        <div className="rounded border border-green-200 bg-green-50 p-2 text-xs text-green-900">
          <p className="font-medium">New temporary password — shown once:</p>
          <code className="mt-1 block rounded border border-green-300 bg-white px-2 py-1 font-mono tracking-wide text-slate-900">
            {newPassword}
          </code>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
