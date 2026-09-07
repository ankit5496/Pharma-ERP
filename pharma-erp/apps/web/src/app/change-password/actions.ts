'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AUTH_ROUTES } from '@pharma-erp/types';

import { apiFetch } from '@/lib/api';

export interface ChangePasswordState {
  status: 'idle' | 'error';
  message?: string;
}

export async function changePasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!currentPassword || !newPassword) {
    return { status: 'error', message: 'Fill in both password fields.' };
  }

  // Checked here rather than server-side because the confirmation field is a
  // typing aid, not a credential — there is no reason to send it to the API.
  if (newPassword !== confirmPassword) {
    return { status: 'error', message: 'The two new passwords do not match.' };
  }

  const result = await apiFetch<void>('/api/v1/auth/change-password', {
    method: 'POST',
    json: { currentPassword, newPassword },
    authenticated: true,
    // Two argon2 operations: verifying the old password and hashing the new one.
    timeoutMs: 20_000,
  });

  if (!result.ok) {
    if (result.status === 401) {
      return { status: 'error', message: 'Your current password is incorrect.' };
    }

    return { status: 'error', message: result.error };
  }

  // The session's must-change-password flag is now false, and every protected
  // page reads it. Drop the cached render so the dashboard does not bounce the
  // user straight back here.
  revalidatePath('/', 'layout');

  redirect(AUTH_ROUTES.afterLogin);
}
